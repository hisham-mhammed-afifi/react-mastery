You are writing a comprehensive, book-quality technical guide called **"The React Mastery Guide: From Mid-Level to Senior and Beyond."** The guide is written in pure JavaScript (no TypeScript). Each invocation of `/next` writes one chapter.

---

## Step 1: Determine What to Write

1. Read `content/PROGRESS.md`.
2. Find the first line that starts with `- [ ]` (not yet complete).
3. That is the chapter you will write. Extract the filename from the parentheses.
4. Read `content/00-table-of-contents.md` and find the matching chapter to get the full list of sections and topics.
5. Announce to the user: "Writing: Part X, Chapter Y: [Title]" before proceeding.

---

## Step 2: Research

Before writing, use web search to research the chapter's topics. You must search for:

- The latest best practices and patterns related to the chapter's topics
- Any recent changes in React (19+), JavaScript (ES2024+), or related libraries
- Common misconceptions or mistakes developers make with these topics
- Real-world examples and case studies from reputable engineering blogs (Vercel, Meta, Kent C. Dodds, Dan Abramov, Josh Comeau, TkDodo, etc.)
- Official documentation references (MDN, React docs, library docs)

Do at least 3 targeted searches per chapter. More for complex chapters. Use the research to ensure accuracy and currency, not to copy content.

---

## Step 3: Write the Chapter

Write the chapter as a single markdown file following these rules:

### File Structure

```markdown
# Part X, Chapter Y: [Chapter Title]

## What You Will Learn

A concise bulleted list of 4-7 specific learning outcomes. Each outcome should be concrete and measurable (e.g., "Explain how the JavaScript engine creates execution contexts during the creation phase" rather than "Understand execution contexts").

---

[Chapter content organized by sections from the TOC]

---

## Chapter Summary

A brief recap of key takeaways (3-5 sentences max).

## Further Reading

- Links to official docs, seminal blog posts, or authoritative resources referenced during research. Only include genuinely valuable resources, not filler.
```

### Writing Style

- **Tone:** Formal, structured, and academic. Write as a textbook, not a blog post. Use precise technical language. Avoid slang, humor, filler phrases, and first-person anecdotes.
- **Never use em dashes (--).** Use commas, semicolons, colons, or parentheses instead.
- **Depth:** This is a book, not a cheat sheet. Each section should thoroughly explain its topic with the depth expected in a university-level textbook. Do not rush through topics.
- **Code examples:** Every concept must include at least one code example. Code should be realistic (not `foo`/`bar`), well-commented, and demonstrate the concept clearly. Use `javascript` as the code fence language.
- **Progressive complexity:** Start each section with the foundational concept, build up to nuance and edge cases.
- **Exercises:** Follow the exercise descriptions from the TOC. Each exercise must include:
  - A clear problem statement
  - Starter code or setup instructions where applicable
  - A complete solution with detailed comments explaining the reasoning
  - A "Key Takeaway" after each exercise summarizing what the reader should have learned
- **React connection:** For Part 1 (JavaScript chapters), explicitly connect each topic to React. Use callout blocks:
  ```markdown
  > **React Connection:** [Explain how this JS concept directly applies to React development]
  ```
- **Common Mistakes:** Include at least 2 "Common Mistake" callouts per chapter:
  ```markdown
  > **Common Mistake:** [Describe the mistake and why developers make it, then show the correction]
  ```
- **Cross-references:** When a topic relates to content in another chapter, reference it:
  ```markdown
  > **See Also:** Part X, Chapter Y, Section Z for [related topic]
  ```

### Content Quality Requirements

- All code must be syntactically correct and runnable
- All technical claims must be accurate (verify against your research)
- No placeholder text ("we will cover this later" without a specific cross-reference)
- No redundant explanations of concepts already covered in previous chapters; cross-reference instead
- Diagrams should be represented as ASCII art or clear textual descriptions when visual representation helps understanding

---

## Step 4: Quality Self-Check

Before saving the file, evaluate the chapter against this checklist. If any item fails, revise before saving.

- [ ] Every section from the TOC is covered with appropriate depth
- [ ] Every concept has at least one code example
- [ ] All code examples are syntactically correct JavaScript (not TypeScript)
- [ ] The "What You Will Learn" section lists concrete, measurable outcomes
- [ ] At least 2 "Common Mistake" callouts are included
- [ ] At least 2 "React Connection" callouts are included (Part 1 chapters)
- [ ] All exercises have: problem statement, starter code (if applicable), full solution, key takeaway
- [ ] No em dashes are used anywhere in the text
- [ ] Cross-references to other chapters are specific (Part X, Chapter Y, Section Z)
- [ ] The chapter reads as a self-contained unit (someone could read just this chapter and learn the topic)
- [ ] "Further Reading" links are real, authoritative resources
- [ ] The writing maintains a formal, academic tone throughout
- [ ] No filler phrases ("In this section we will...", "As we all know...", "It goes without saying...")

---

## Step 5: Save and Update Progress

1. Save the chapter file to `content/[filename]` using the filename from PROGRESS.md.
2. Update `content/PROGRESS.md`: change the chapter's `- [ ]` to `- [x]`.
3. Report to the user:
   - Chapter title written
   - File path
   - Number of sections covered
   - Next chapter title (what `/next` will write next time)
