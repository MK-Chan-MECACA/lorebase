import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { api } from "../api";

const FONT_SIZES = ["14px", "16px", "18px", "22px", "28px"];

async function uploadImage(editor: TiptapEditor, file: File) {
  const form = new FormData();
  form.append("file", file);
  const { url } = await api<{ url: string }>("/api/images", { method: "POST", body: form });
  editor.chain().focus().setImage({ src: url }).run();
}

function Toolbar({ editor }: { editor: TiptapEditor }) {
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) uploadImage(editor, file).catch((e) => alert(e.message));
    };
    input.click();
  };

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().setLink({ href: url }).run();
  };

  const block =
    editor.isActive("heading", { level: 1 }) ? "h1" :
    editor.isActive("heading", { level: 2 }) ? "h2" :
    editor.isActive("heading", { level: 3 }) ? "h3" : "p";

  return (
    <div className="editor-toolbar">
      <select
        value={block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <select
        value={(editor.getAttributes("textStyle").fontSize as string) ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontSize(v).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
      >
        <option value="">Size</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button type="button" className={editor.isActive("bold") ? "on" : ""} onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>B</b>
      </button>
      <button type="button" className={editor.isActive("italic") ? "on" : ""} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <i>I</i>
      </button>
      <button type="button" className={editor.isActive("underline") ? "on" : ""} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <u>U</u>
      </button>
      <button type="button" className={editor.isActive("bulletList") ? "on" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        • List
      </button>
      <button type="button" className={editor.isActive("orderedList") ? "on" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1. List
      </button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()}>⇤</button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()}>↔</button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()}>⇥</button>
      <button type="button" className={editor.isActive("link") ? "on" : ""} onClick={setLink}>
        Link
      </button>
      <button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run()}>
        Table
      </button>
      <button type="button" onClick={pick}>
        Image
      </button>
    </div>
  );
}

export default function Editor({ initialHtml, onReady }: { initialHtml: string; onReady: (e: TiptapEditor) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextStyleKit,
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit,
    ],
    content: initialHtml,
    onCreate: ({ editor }) => onReady(editor),
    editorProps: {
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
        if (file && editor) {
          uploadImage(editor, file).catch((e) => alert(e.message));
          return true;
        }
        return false;
      },
    },
  });

  if (!editor) return null;
  return (
    <div className="editor-frame">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="editor-content doc-body" />
    </div>
  );
}
