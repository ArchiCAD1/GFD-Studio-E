# Specification — document setup, templates, Word files and revisions

Approved by the owner on 2026-11-14 ("Go ahead"), after the mockup "Document setup and revisions"
(Document editor mockup, second artboard). Concept and design stage only.

## What the owner asked for

1. Project headline and project information, the parties (client, consultant, main contractor, MEP
   contractor) and any further details the user wants to add.
2. Page setup; header and footer management with the company logo; watermark.
3. Cover page and index (contents) page, created and managed in the app.
4. Indent and outdent of clauses and headings; add pages; page breaks; appendices.
5. Tables and pictures in the document, pasted from Sheets or Excel — as blocks in the text flow.
6. Save as; open an existing Word document; save a product specification as a template and use it
   again; turn values of an opened document into live project fields.
7. The specification's own revisions, separate from the project's: issue, new revision, compare,
   change list, and optional highlight, revision cloud and revision mark on changed clauses.

## Rules

- Nothing of any standard is shipped. Wording is the engineer's own; a missing value prints
  DATA REQUIRED.
- Own code only, with the libraries the app already has (`docx` for Word files).
- Exports stay black-and-white (the watermark is light grey).
- A value the project already holds is not typed twice: a blank party is read from Project
  information, the logo from the drawing title block, unless the specification sets its own.

## Stages (one pull request each)

| Stage | Content | State |
|---|---|---|
| 1 + 2 | Specification tab of the page ribbon: document title, number, status, parties, own details (each a field); paper, orientation, margins; header and footer (left, centre, right, with fields and page numbers); logo and its position; watermark. Applied to the PDF and the Word file. | done (#571) |
| 3 | Cover page (logo, title, project, number, status, parties, own details, revision table, note; no header or footer) and contents page (sections, optionally clause headings, page numbers), each on unless turned off. The revision table lists the project's issued revisions until stage 7 gives the specification its own. | done (#648) |
| 4 | Indent / outdent (sub-headings 2.1.3; items a), b) … and i), ii) …), a page break before a line, appendices (lettered, after the numbered sections). | done (#650) |
| 5 | Tables and pictures as blocks in the text flow, with numbered captions (Table 1, Figure 1). A table comes from cells copied in Sheets or Excel and pasted on the page, from one of the project's sheets (a copy), or empty; cells, rows, columns and the header row are edited on the page. A picture is a PNG or JPEG (up to 1 MB, kept in the project file), from a file or pasted, at a chosen share of the text width. | this change |
| 6 | Template library; Save as; open a Word document; values to fields. | |
| 7 | Specification revisions with highlight, cloud and revision marks. | |

## Changes to what is on screen (stage 1 + 2)

- The greyed "Specification" tab of the page ribbon is now live. It shows four cards in place of the
  section list and page: Document and parties; Additional details; Page setup; Header, footer, logo
  and watermark (with a small preview of the header and footer as printed).
- The top line of the page on the Home tab now shows the header slots (default: project name left,
  document title right) instead of "project — title" and "Section n".
- The summary strip also shows the document number, status, paper and watermark.
- Exports: the PDF now prints its own header, footer and page numbers; the Word file has the same
  three-slot header and footer in place of the fixed ones. With nothing set, both print the project
  name, the document title, the revision and "Page n of N" as before.

## Changes to what is on screen (stage 3)

- Specification tab: a "Pages" group (Cover page, Contents page) and a card "Cover page and contents page".
- The summary strip says whether the document has a cover and a contents page.
- Exports: a new specification now starts with a cover page and has the contents on a page of their own
  with page numbers. Turning the cover off gives the former first page (title block, then contents).

## Changes to what is on screen (stage 4)

- Home tab, Clauses group: Indent, Outdent, Page break. File tab, Sections group: Appendix.
- On the page an indented line moves in and takes a letter or a small roman number; a page break shows as a
  dashed line marked "Page break"; an appendix is headed "Appendix A — title" and lettered in the section list.
- Numbering: a heading and a clause that stand side by side now share one run of numbers, so a clause written
  before the first heading (2.1) no longer has the same number as that heading (now 2.2).

## Changes to what is on screen (stage 5)

- Home tab: a "Tables and pictures" group — Add table, Paste cells, Add picture, Table from sheet.
- On the page a table or picture sits in the text flow under its clause; clicking it shows its caption box
  and its own tools (rows, columns, header row; picture width). Ctrl+V on the page turns copied cells into
  a table and a copied picture into a picture; plain text is left to the text box.
- Not in this stage: a table that follows its sheet live, merged cells, column widths, cell formatting.

## Not checked on screen

Built and tested without launching the app. The Word file was opened in LibreOffice (header, footer,
logo, watermark and page size as expected); it has not been opened in Microsoft Word.
