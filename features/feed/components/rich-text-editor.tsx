"use client"

import * as React from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconList,
  IconListNumbers,
  type Icon,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"

// StarterKit v3 already bundles Underline + bullet/ordered lists, so no extra
// extensions are needed. `immediatelyRender: false` avoids SSR hydration
// mismatches under the Next.js App Router.
export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert min-h-40 max-w-none px-3 py-2 focus:outline-none",
        "data-placeholder": placeholder ?? "",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Keep the editor in sync when the value is reset externally (e.g. dialog
  // close), without clobbering the caret during normal typing.
  React.useEffect(() => {
    if (editor && value === "" && editor.getHTML() !== "<p></p>") {
      editor.commands.clearContent()
    }
  }, [value, editor])

  if (!editor) return <div className="min-h-40 rounded-md border" />

  return (
    <div className="rounded-md border">
      <div className="bg-muted/50 flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
        <ToolbarButton
          icon={IconBold}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        />
        <ToolbarButton
          icon={IconItalic}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
        />
        <ToolbarButton
          icon={IconUnderline}
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          label="Underline"
        />
        <span className="bg-border mx-1 h-5 w-px" />
        <ToolbarButton
          icon={IconList}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Bullet list"
        />
        <ToolbarButton
          icon={IconListNumbers}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Numbered list"
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({
  icon: Icon,
  active,
  onClick,
  label,
}: {
  icon: Icon
  active: boolean
  onClick: () => void
  label: string
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
