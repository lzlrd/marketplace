## Gemini 3  {% id="gemini-3" %}

[Gemini 3 models](/docs/models#gemini-3) are designed for advanced
reasoning and instruction following.
They respond best to prompts that are direct, well-structured, and clearly
define the task and any constraints. The following practices are recommended for
optimal results with Gemini 3:

### Core prompting principles  {% id="core-prompting-principles" %}

*   **Be precise and direct:** State your goal clearly and concisely. Avoid
    unnecessary or overly persuasive language.

*   **Use consistent structure:** Employ clear delimiters to separate different
    parts of your prompt. XML-style tags (e.g., `<context>`, `<task>`) or
    Markdown headings are effective. Choose one format and use it consistently
    within a single prompt.

*   **Define parameters:** Explicitly explain any ambiguous terms or parameters.

*   **Control output verbosity:** By default, Gemini 3 models provide direct and
    efficient answers. If you need a more conversational or detailed response,
    you must explicitly request it in your instructions.

*   **Handle multimodal inputs coherently:** When using text, images, audio, or
    video, treat them as equal-class inputs. Ensure your instructions clearly
    reference each modality as needed.

*   **Prioritize critical instructions:** Place essential behavioral
    constraints, role definitions (persona), and output format requirements in
    the System Instruction or at the very beginning of the user prompt.

*   **Structure for long contexts:** When providing large amounts of context
    (e.g., documents, code), supply all the context first. Place your specific
    instructions or questions at the very *end* of the prompt.

*   **Anchor context:** After a large block of data, use a clear transition
    phrase to bridge the context and your query, such as "Based on the
    information above..."


### Gemini 3 Flash strategies  {% id="gemini-3-flash-strategies" %}

*   **Current day accuracy:** Add the following clause to the system
    instructions to help the model pay attention to the current day being in
    2026:

    ```none
    For time-sensitive user queries that require up-to-date information, you
    MUST follow the provided current time (date and year) when formulating
    search queries in tool calls. Remember it is 2026 this year.
    ```

*   **Knowledge cutoff accuracy:** Add the following clause to the system
    instructions to make the model aware of its knowledge cutoff:

    ```none
    Your knowledge cutoff date is January 2025.
    ```

*   **Grounding performance:** Add the following clause to the system
    instructions (with edits where appropriate) to improve the model's ability
    to ground responses in provided context:

    ```none
    You are a strictly grounded assistant limited to the information provided in
    the User Context. In your answers, rely **only** on the facts that are
    directly mentioned in that context. You must **not** access or utilize your
    own knowledge or common sense to answer. Do not assume or infer from the
    provided facts; simply report them exactly as they appear. Your answer must
    be factual and fully truthful to the provided text, leaving absolutely no
    room for speculation or interpretation. Treat the provided context as the
    absolute limit of truth; any facts or details that are not directly
    mentioned in the context must be considered **completely untruthful** and
    **completely unsupported**. If the exact answer is not explicitly written in
    the context, you must state that the information is not available.
    ```


### Enhancing reasoning and planning  {% id="enhancing-reasoning-and-planning" %}

Gemini 2.5 and 3 series models automatically generate internal "thinking" text
to improve reasoning performance. As such, it's generally not necessary to have
the model outline, plan, or detail reasoning steps in the returned response
itself. For problems that require heavy reasoning, simple requests like "Think
very hard before answering" can improve performance, though at the cost of
extra thinking tokens.

See the [Gemini thinking](/docs/thinking) documentation for more
detail.

### Structured prompting examples  {% id="structured-prompting-examples" %}

Using tags or Markdown helps the model distinguish between instructions,
context, and tasks.

**XML example:**

```xml
<role>
You are a helpful assistant.
</role>

<constraints>
1. Be objective.
2. Cite sources.
</constraints>

<context>
[Insert User Input Here - The model knows this is data, not instructions]
</context>

<task>
[Insert the specific user request here]
</task>
```

**Markdown example:**

```markdown
# Identity
You are a senior solution architect.

# Constraints
- No external libraries allowed.
- Python 3.11+ syntax only.

# Output format
Return a single code block.
```

### Example template combining best practices  {% id="example-template-combining-best-practices" %}

This template captures the core principles for prompting with Gemini 3. Always
make sure to iterate and modify for your specific use case.

**System Instruction:**

```xml
<role>
You are Gemini 3, a specialized assistant for [Insert Domain, e.g., Data Science].
You are precise, analytical, and persistent.
</role>

<instructions>
1. **Plan**: Analyze the task and create a step-by-step plan.
2. **Execute**: Carry out the plan.
3. **Validate**: Review your output against the user's task.
4. **Format**: Present the final answer in the requested structure.
</instructions>

<constraints>
- Verbosity: [Specify Low/Medium/High]
- Tone: [Specify Formal/Casual/Technical]
</constraints>

<output_format>
Structure your response as follows:

1. **Executive Summary**: [Short overview]
2. **Detailed Response**: [The main content]
</output_format>
```

**User Prompt:**

```xml
<context>
[Insert relevant documents, code snippets, or background info here]
</context>

<task>
[Insert specific user request here]
</task>

<final_instruction>
Remember to think step-by-step before answering.
</final_instruction>
```

