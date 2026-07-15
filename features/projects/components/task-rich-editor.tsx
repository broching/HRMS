"use client"

import * as React from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extensions"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconListCheck,
  IconBlockquote,
  IconLink,
  type Icon,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"

// A Notion-ish task editor: headings, checklists, lists, quote, code, links.
// StarterKit v3 already bundles Bold/Italic/Underline/Strike/Code/CodeBlock/
// Heading/Blockquote/Lists/Link, so we only add TaskList + TaskItem (checkbox
// lists) and a Placeholder. Content is stored as HTML.
function extensions(placeholder?: string) {
  return [
    StarterKit.configure({
      link: { openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer" } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: placeholder ?? "Write something…" }),
  ]
}

// Shared prose styling so the editor and the read-only view render identically.
const PROSE =
  "prose prose-sm dark:prose-invert max-w-none focus:outline-none " +
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 " +
  "[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start " +
  "[&_ul[data-type=taskList]_li]:gap-2 " +
  "[&_ul[data-type=taskList]_li>label]:mt-1 [&_ul[data-type=taskList]_li>div]:min-w-0"

export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true
  const stripped = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()
  return stripped.length === 0
}

export function TaskRichEditor({
  value,
  onChange,
  placeholder,
  minHeight = "min-h-32",
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
}) {
  const editor = useEditor({
    extensions: extensions(placeholder),
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: cn(PROSE, minHeight, "px-3 py-2") },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Reset the editor when the value is cleared externally (e.g. dialog close or
  // after submitting a comment), without clobbering the caret while typing.
  React.useEffect(() => {
    if (editor && value === "" && editor.getHTML() !== "<p></p>") {
      editor.commands.clearContent()
    }
  }, [value, editor])

  if (!editor) return <div className={cn("rounded-md border", minHeight)} />

  return (
    <div className="rounded-md border">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

// Read-only renderer using a non-editable editor instance so checklists/links
// render with full fidelity.
export function RichTextView({ html }: { html: string | null | undefined }) {
  const editor = useEditor({
    extensions: extensions(),
    content: html || "",
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: PROSE } },
  })
  React.useEffect(() => {
    if (editor && html !== undefined && editor.getHTML() !== (html || "<p></p>")) {
      editor.commands.setContent(html || "")
    }
  }, [html, editor])
  if (!editor) return null
  return <EditorContent editor={editor} />
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = React.useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("Link URL", prev ?? "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [editor])

  return (
    <div className="bg-muted/50 flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
      <Btn icon={IconBold} label="Bold" active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()} />
      <Btn icon={IconItalic} label="Italic" active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()} />
      <Btn icon={IconUnderline} label="Underline" active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <Btn icon={IconStrikethrough} label="Strikethrough" active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()} />
      <Sep />
      <Btn icon={IconH1} label="Heading 1" active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <Btn icon={IconH2} label="Heading 2" active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <Btn icon={IconH3} label="Heading 3" active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <Sep />
      <Btn icon={IconList} label="Bullet list" active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <Btn icon={IconListNumbers} label="Numbered list" active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <Btn icon={IconListCheck} label="Checklist" active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <Sep />
      <Btn icon={IconBlockquote} label="Quote" active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <Btn icon={IconCode} label="Code block" active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <Btn icon={IconLink} label="Link" active={editor.isActive("link")} onClick={setLink} />
    </div>
  )
}

function Sep() {
  return <span className="bg-border mx-1 h-5 w-px" />
}

function Btn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: Icon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "hover:bg-accent flex size-7 items-center justify-center rounded",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}
