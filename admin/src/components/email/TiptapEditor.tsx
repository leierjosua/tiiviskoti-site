import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import ImageBase from "@tiptap/extension-image";
import { useState, useRef } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Link as LinkIcon, Undo2, Redo2,
  ChevronDown, Minus, Check, X,
} from "lucide-react";
import { EDITOR_INLINE_STYLE } from "@/lib/email-styles";

// Image extension that preserves width/style attributes for email rendering
const Image = ImageBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute("style"),
        renderHTML: (attributes) => {
          if (!attributes.style) return {};
          return { style: attributes.style };
        },
      },
    };
  },
});

// Inline font-size extension as a mark (applies to selected text, not entire block)
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
});

const FONT_SIZES = [
  { label: "Pieni", value: "12px" },
  { label: "Normaali", value: "14px" },
  { label: "Keskikokoinen", value: "18px" },
  { label: "Suuri", value: "24px" },
  { label: "Erittäin suuri", value: "32px" },
];

interface TiptapEditorProps {
  content?: string;
  placeholder?: string;
  onChange?: (html: string) => void;
  autofocus?: boolean;
}

export default function TiptapEditor({ content = "", placeholder = "Kirjoita viestisi...", onChange, autofocus = true }: TiptapEditorProps) {
  const [showTextMenu, setShowTextMenu] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      FontSize,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-accent underline" } }),
      Placeholder.configure({ placeholder, emptyEditorClass: "is-editor-empty" }),
    ],
    content,
    autofocus,
    onCreate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "max-w-none min-h-[120px] outline-none px-3 py-2",
        style: EDITOR_INLINE_STYLE,
      },
      // Enter = new paragraph (standard email-client behavior)
      // Shift+Enter = <br> soft line break within a paragraph
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  if (!editor) return null;

  const btnCls = (active: boolean) =>
    `p-1.5 rounded transition-colors ${active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-bg-secondary hover:text-text-primary"}`;

  function openLinkInput() {
    const previousUrl = editor!.getAttributes("link").href;
    setLinkUrl(previousUrl || "https://");
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.select(), 50);
  }

  function applyLink() {
    if (!linkUrl.trim()) {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor!.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
    }
    setShowLinkInput(false);
  }

  function cancelLink() {
    setShowLinkInput(false);
    editor!.chain().focus().run();
  }

  // Detect current font size from textStyle mark
  const currentFontSize = editor!.getAttributes("textStyle").fontSize || "14px";
  const currentLabel = FONT_SIZES.find((s) => s.value === currentFontSize)?.label || "Normaali";

  function setFontSize(size: string) {
    if (size === "14px") {
      // Reset to default — remove the fontSize style
      editor!.chain().focus().unsetMark("textStyle").run();
    } else {
      editor!.chain().focus().setMark("textStyle", { fontSize: size }).run();
    }
    setShowTextMenu(false);
  }

  return (
    <div className="border border-border rounded-xl focus-within:border-accent/50 transition-colors relative">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-bg-secondary/30 flex-wrap">
        {/* Font size dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTextMenu(!showTextMenu)}
            className={`${btnCls(false)} flex items-center gap-1 min-w-[60px]`}
          >
            <span className="text-[10px] font-medium">{currentLabel}</span>
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {showTextMenu && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg py-1 w-44 z-20">
              {FONT_SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setFontSize(s.value)}
                  className={`w-full text-left px-3 py-1.5 hover:bg-bg-secondary ${currentFontSize === s.value ? "text-accent font-medium" : ""}`}
                  style={{ fontSize: s.value }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-border mx-0.5" />

        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnCls(editor.isActive("bold"))} title="Lihavointi (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnCls(editor.isActive("italic"))} title="Kursiivi (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnCls(editor.isActive("underline"))} title="Alleviivaus (Ctrl+U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnCls(editor.isActive("strike"))} title="Yliviivaus">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnCls(editor.isActive("bulletList"))} title="Lista">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnCls(editor.isActive("orderedList"))} title="Numeroitu lista">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        <div className="relative">
          <button type="button" onClick={openLinkInput} className={btnCls(editor.isActive("link"))} title="Linkki">
            <LinkIcon className="w-3.5 h-3.5" />
          </button>
          {showLinkInput && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg p-2 z-20 flex items-center gap-1.5 w-72">
              <input
                ref={linkInputRef}
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") cancelLink(); }}
                placeholder="https://..."
                className="flex-1 px-2 py-1 text-xs border border-border rounded focus:outline-none focus:border-accent"
              />
              <button type="button" onClick={applyLink} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Aseta">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={cancelLink} className="p-1 text-text-muted hover:bg-bg-secondary rounded" title="Peruuta">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnCls(false)} title="Vaakaviiva">
          <Minus className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btnCls(false)} title="Kumoa (Ctrl+Z)">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btnCls(false)} title="Tee uudelleen (Ctrl+Y)">
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} className="[&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mb-1.5 [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_p]:mt-0 [&_.ProseMirror_p]:mb-2 [&_.ProseMirror_hr]:my-3 [&_.ProseMirror_hr]:border-border [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_img]:max-w-[120px] [&_.ProseMirror_img]:h-auto [&_.ProseMirror_.is-empty]:before:content-[attr(data-placeholder)] [&_.ProseMirror_.is-empty]:before:text-text-muted [&_.ProseMirror_.is-empty]:before:float-left [&_.ProseMirror_.is-empty]:before:pointer-events-none" />
    </div>
  );
}
