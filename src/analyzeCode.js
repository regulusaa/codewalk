const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'
const TOOL_NAME = 'report_line_analysis'

const TOOL = {
  name: TOOL_NAME,
  description:
    'Report a per-line analysis of the submitted code. Call this exactly once with an entry for every non-blank line.',
  input_schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        description: 'One entry per non-blank line of the submitted code.',
        items: {
          type: 'object',
          properties: {
            n: {
              type: 'integer',
              description: 'The 1-based line number this entry describes.',
            },
            explanation: {
              type: 'string',
              description:
                'A short, standalone explanation of what this line does. Must make sense on its own, without the reader having seen the other explanations.',
            },
            relations: {
              type: 'array',
              description:
                'At most the 1-2 most important other lines this line uses or depends on. Omit or leave empty when nothing important is related.',
              maxItems: 2,
              items: {
                type: 'object',
                properties: {
                  n: {
                    type: 'integer',
                    description:
                      'The 1-based line number of the related line. Must be a line number that exists in the submitted code.',
                  },
                  note: {
                    type: 'string',
                    description:
                      'A short note on why this line relates to that one, e.g. "calls the function defined here".',
                  },
                },
                required: ['n', 'note'],
              },
            },
          },
          required: ['n', 'explanation', 'relations'],
        },
      },
    },
    required: ['lines'],
  },
}

function buildPrompt(numberedCode) {
  return `Analyze this code, which has been numbered one line per line:

<code>
${numberedCode}
</code>

For every non-blank line, report:

1. A short standalone explanation of what that line does. Each explanation is read on its own, out of context, so it must make sense without the reader having seen any of the other explanations.
2. At most the top 1-2 most important OTHER lines it relates to, each with a short note on why. Pick only genuinely important relationships — if a line has no meaningful relationship to another line, return an empty relations list rather than padding it out.

Point every relationship in one direction only: from the line that uses or depends on something, to the line that provides it. So a call site relates to the definition it calls; the definition does not relate back to its call sites. Never record the same pair twice in both directions.

Only reference line numbers that actually appear in the numbered code above. Skip blank lines entirely.

Report your analysis by calling the ${TOOL_NAME} tool.`
}

/**
 * Analyze `code` with Claude and return a validated per-line analysis.
 *
 * @param {string} apiKey - Anthropic API key.
 * @param {string} code - The source code to analyze.
 * @returns {Promise<{lines: Array<{n: number, explanation: string, relations: Array<{n: number, note: string}>}>}>}
 */
export async function analyzeCode(apiKey, code) {
  const sourceLines = code.split('\n')
  const numberedCode = sourceLines
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n')

  let response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        // Intentional: this app calls the Anthropic API straight from the browser.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: buildPrompt(numberedCode) }],
      }),
    })
  } catch (err) {
    throw new Error(`Could not reach the Anthropic API: ${err.message}`)
  }

  const raw = await response.text()

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error(
      `Anthropic API returned a non-JSON response (HTTP ${response.status}): ${raw.slice(0, 200)}`,
    )
  }

  if (!response.ok) {
    const detail = body?.error?.message ?? raw.slice(0, 200)
    throw new Error(`Anthropic API error (HTTP ${response.status}): ${detail}`)
  }

  const toolUse = body.content?.find((block) => block.type === 'tool_use')
  if (!toolUse) {
    throw new Error(
      `Expected a tool_use block in the response but found none (stop_reason: ${body.stop_reason}).`,
    )
  }

  const lines = toolUse.input?.lines
  if (!Array.isArray(lines)) {
    throw new Error('Tool call did not contain a "lines" array.')
  }

  // Claude sometimes invents line numbers. Drop any relation pointing at a
  // line number that isn't actually in the submitted code.
  const validated = lines.map((line) => ({
    ...line,
    relations: (Array.isArray(line.relations) ? line.relations : []).filter(
      (relation) =>
        Number.isInteger(relation?.n) &&
        relation.n >= 1 &&
        relation.n <= sourceLines.length,
    ),
  }))

  return { lines: validated }
}
