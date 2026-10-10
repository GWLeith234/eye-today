// The one extension list used by the browser editor and by the server when it
// turns body_json into HTML. Do not import @tiptap/react here.

import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import StarterKit from "@tiptap/starter-kit";

import { parseEmbedUrl } from "./embed";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pullQuote: {
      togglePullQuote: () => ReturnType;
    };
    embed: {
      insertEmbed: (url: string) => ReturnType;
    };
    poll: {
      insertPoll: (pollId: string) => ReturnType;
    };
  }
}

export const PullQuote = Node.create({
  name: "pullQuote",
  group: "block",
  content: "inline*",
  defining: true,
  // Parse before the plain blockquote from StarterKit.
  priority: 110,

  parseHTML() {
    return [{ tag: 'blockquote[data-type="pull-quote"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(HTMLAttributes, { "data-type": "pull-quote", class: "pull-quote" }), 0];
  },

  addCommands() {
    return {
      togglePullQuote:
        () =>
        ({ commands }) =>
          commands.toggleNode(this.name, "paragraph"),
    };
  },
});

export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      provider: { default: null },
      url: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-embed]",
        getAttrs: (element) => {
          const parsed = parseEmbedUrl((element as HTMLElement).getAttribute("data-url"));
          return parsed ? { provider: parsed.provider, url: parsed.url } : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const parsed = parseEmbedUrl(node.attrs.url);
    if (!parsed) return ["figure", { "data-embed": "invalid" }];
    return [
      "figure",
      { "data-embed": parsed.provider, "data-url": parsed.url, class: `embed embed-${parsed.provider}` },
      [
        "iframe",
        {
          src: parsed.src,
          width: "550",
          height: parsed.provider === "x" ? "600" : "700",
          loading: "lazy",
          frameborder: "0",
          title: parsed.provider === "x" ? "Post on X" : "Instagram post",
        },
      ],
    ];
  },

  addCommands() {
    return {
      insertEmbed:
        (url: string) =>
        ({ commands }) => {
          const parsed = parseEmbedUrl(url);
          if (!parsed) return false;
          return commands.insertContent({ type: this.name, attrs: { provider: parsed.provider, url: parsed.url } });
        },
    };
  },
});

export const POLL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A placeholder for a reader poll. The article page mounts the live poll into it; the HTML holds only the id.
export const Poll = Node.create({
  name: "poll",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return { pollId: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-poll]",
        getAttrs: (element) => {
          const id = (element as HTMLElement).getAttribute("data-poll") ?? "";
          return POLL_ID.test(id) ? { pollId: id.toLowerCase() } : false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const id = typeof node.attrs.pollId === "string" && POLL_ID.test(node.attrs.pollId) ? node.attrs.pollId.toLowerCase() : null;
    if (!id) return ["div", { class: "poll-embed" }];
    return ["div", { "data-poll": id, class: "poll-embed" }, "Poll"];
  },

  addCommands() {
    return {
      insertPoll:
        (pollId: string) =>
        ({ commands }) => {
          if (!POLL_ID.test(pollId.trim())) return false;
          return commands.insertContent({ type: this.name, attrs: { pollId: pollId.trim().toLowerCase() } });
        },
    };
  },
});

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["http", "https", "mailto"],
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      isAllowedUri: (url, ctx) => SAFE_LINK.test(url) && ctx.defaultValidate(url),
    },
  }),
  Image.configure({ inline: false, allowBase64: false }),
  Youtube.configure({ nocookie: true, controls: true, width: 640, height: 360 }),
  PullQuote,
  Embed,
  Poll,
];
