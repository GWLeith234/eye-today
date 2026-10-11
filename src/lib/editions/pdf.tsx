import "server-only";

import path from "node:path";

import { Document, Font, Image as PdfImage, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { AMBER, BRAND, INK, MUTED, PAPER, RULE } from "@/lib/brand/palette";
import { mediaUrl } from "@/lib/media/url";
import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";

import { type Block, htmlToBlocks } from "./blocks";
import { issueLabel } from "./model";
import type { EditionDetail, EditionStory } from "./public";

// The issue as a PDF: cover, contents, the editor's letter, then one chapter per story. Fonts are the
// site's own (Fraunces display, Source Serif 4 text, Inter labels) from the Fontsource packages, which
// ship OFL .woff files react-pdf can embed. Images are fetched from the public media bucket by URL.

const fontFile = (pkg: string, file: string) => path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file);

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  fontsReady = true;
  Font.register({
    family: "Fraunces",
    fonts: [
      { src: fontFile("fraunces", "fraunces-latin-400-normal.woff"), fontWeight: 400 },
      { src: fontFile("fraunces", "fraunces-latin-700-normal.woff"), fontWeight: 700 },
      { src: fontFile("fraunces", "fraunces-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
  Font.register({
    family: "Source Serif 4",
    fonts: [
      { src: fontFile("source-serif-4", "source-serif-4-latin-400-normal.woff"), fontWeight: 400 },
      { src: fontFile("source-serif-4", "source-serif-4-latin-600-normal.woff"), fontWeight: 600 },
      { src: fontFile("source-serif-4", "source-serif-4-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
  Font.register({
    family: "Inter",
    fonts: [
      { src: fontFile("inter", "inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: fontFile("inter", "inter-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

const s = StyleSheet.create({
  page: { backgroundColor: PAPER, color: INK, fontFamily: "Source Serif 4", fontSize: 10.5, lineHeight: 1.45, paddingTop: 56, paddingBottom: 56, paddingHorizontal: 54 },
  cover: { backgroundColor: PAPER, color: INK, padding: 0 },
  coverInner: { flex: 1, padding: 48, justifyContent: "space-between" },
  wordmark: { fontFamily: "Fraunces", fontSize: 30, fontWeight: 700, letterSpacing: -0.5 },
  kicker: { fontFamily: "Inter", fontSize: 9, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED },
  coverTitle: { fontFamily: "Fraunces", fontSize: 34, fontWeight: 700, lineHeight: 1.1, marginTop: 10 },
  coverImage: { width: "100%", height: 300, objectFit: "cover", marginTop: 22, marginBottom: 12 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: INK, marginVertical: 12 },
  thinRule: { borderBottomWidth: 0.75, borderBottomColor: RULE, marginVertical: 8 },
  h1: { fontFamily: "Fraunces", fontSize: 22, fontWeight: 700, lineHeight: 1.15, marginBottom: 6 },
  h2: { fontFamily: "Fraunces", fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  h3: { fontFamily: "Source Serif 4", fontSize: 12, fontWeight: 600, marginTop: 10, marginBottom: 3 },
  dek: { fontFamily: "Source Serif 4", fontSize: 12.5, fontStyle: "italic", color: MUTED, marginBottom: 6 },
  byline: { fontFamily: "Inter", fontSize: 9, color: MUTED, marginBottom: 10 },
  p: { marginBottom: 7, textAlign: "justify" },
  quote: { borderLeftWidth: 2, borderLeftColor: AMBER, paddingLeft: 10, marginVertical: 8, fontStyle: "italic", color: MUTED },
  li: { flexDirection: "row", marginBottom: 3, paddingLeft: 6 },
  bullet: { width: 14 },
  hero: { width: "100%", height: 220, objectFit: "cover", marginBottom: 4 },
  credit: { fontFamily: "Inter", fontSize: 7.5, color: MUTED, marginBottom: 10 },
  tocRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  tocSection: { fontFamily: "Inter", fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: BRAND },
  tocTitle: { fontFamily: "Fraunces", fontSize: 13, fontWeight: 700, marginTop: 1 },
  footer: { position: "absolute", bottom: 28, left: 54, right: 54, flexDirection: "row", justifyContent: "space-between", fontFamily: "Inter", fontSize: 7.5, color: MUTED },
  small: { fontFamily: "Inter", fontSize: 8, color: MUTED, lineHeight: 1.4 },
  link: { color: BRAND, textDecoration: "none" },
});

type Props = { edition: EditionDetail; stories: EditionStory[]; siteUrl: string };

function Footer({ edition, siteUrl }: { edition: EditionDetail; siteUrl: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>Eye Today · {issueLabel(edition.issue_month)}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      <Link src={`${siteUrl}/editions/${edition.slug}`} style={s.link}>
        {siteUrl.replace(/^https?:\/\//, "")}
      </Link>
    </View>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === "heading") return <Text key={i} style={block.level === 2 ? s.h2 : s.h3}>{block.text}</Text>;
        if (block.kind === "quote") return <Text key={i} style={s.quote}>{block.text}</Text>;
        if (block.kind === "list")
          return (
            <View key={i} style={{ marginBottom: 6 }}>
              {block.items.map((item, j) => (
                <View key={j} style={s.li}>
                  <Text style={s.bullet}>{block.ordered ? `${j + 1}.` : "•"}</Text>
                  <Text style={{ flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>
          );
        return <Text key={i} style={s.p}>{block.text}</Text>;
      })}
    </>
  );
}

const date = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));

export function EditionDocument({ edition, stories, siteUrl }: Props) {
  registerFonts();
  const label = issueLabel(edition.issue_month);
  const letter = htmlToBlocks(edition.letter_html);
  return (
    <Document title={`${edition.title} — Eye Today, ${label}`} author="Eye Today" subject={`Eye Today e-edition, ${label}`} language="en">
      <Page size="A4" style={s.cover}>
        <View style={s.coverInner}>
          <View>
            <Text style={s.wordmark}>Eye Today</Text>
            <Text style={s.kicker}>E-edition · {label}</Text>
            <Text style={s.coverTitle}>{edition.title}</Text>
          </View>
          {edition.cover_storage_path ? <PdfImage src={mediaUrl(edition.cover_storage_path, { width: 1200 })} style={s.coverImage} /> : <View style={s.rule} />}
          <View>
            <Text style={s.kicker}>Inside</Text>
            {stories.slice(0, 6).map((story) => (
              <Text key={story.article_id} style={{ fontFamily: "Fraunces", fontSize: 12, marginTop: 3 }}>
                {story.title}
              </Text>
            ))}
            <Text style={[s.small, { marginTop: 18 }]}>{MEDICAL_DISCLAIMER}</Text>
          </View>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>Contents</Text>
        <Text style={s.h1}>{label}</Text>
        <View style={s.rule} />
        {letter.length > 0 ? (
          <View style={s.tocRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.tocSection}>From the editor</Text>
              <Text style={s.tocTitle}>A letter from the editor</Text>
            </View>
          </View>
        ) : null}
        {stories.map((story) => (
          <View key={story.article_id} style={s.tocRow} wrap={false}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.tocSection}>{story.section_name}</Text>
              <Text style={s.tocTitle}>{story.title}</Text>
              {story.dek ? <Text style={[s.small, { marginTop: 2 }]}>{story.dek}</Text> : null}
            </View>
            <Text style={[s.small, { width: 60, textAlign: "right" }]}>{story.byline ?? ""}</Text>
          </View>
        ))}
        <Footer edition={edition} siteUrl={siteUrl} />
      </Page>

      {letter.length > 0 ? (
        <Page size="A4" style={s.page}>
          <Text style={s.kicker}>From the editor</Text>
          <Text style={s.h1}>A letter from the editor</Text>
          <View style={s.rule} />
          <Blocks blocks={letter} />
          <Footer edition={edition} siteUrl={siteUrl} />
        </Page>
      ) : null}

      {stories.map((story) => (
        <Page key={story.article_id} size="A4" style={s.page}>
          <Text style={s.kicker}>{story.section_name}</Text>
          <Text style={s.h1}>{story.title}</Text>
          {story.dek ? <Text style={s.dek}>{story.dek}</Text> : null}
          <Text style={s.byline}>
            {story.byline ? `By ${story.byline} · ` : ""}
            {date(story.published_at)}
          </Text>
          {story.hero_storage_path ? (
            <>
              <PdfImage src={mediaUrl(story.hero_storage_path, { width: 1200 })} style={s.hero} />
              <Text style={s.credit}>{[story.hero_alt, story.hero_credit ? `Photo: ${story.hero_credit}` : null].filter(Boolean).join(" — ")}</Text>
            </>
          ) : (
            <View style={s.thinRule} />
          )}
          <Blocks blocks={htmlToBlocks(story.body_html ?? "")} />
          <Text style={[s.small, { marginTop: 10 }]}>
            Read online: {siteUrl}/{story.section_slug}/{story.article_slug}
          </Text>
          <Footer edition={edition} siteUrl={siteUrl} />
        </Page>
      ))}
    </Document>
  );
}

export async function renderEditionPdf(props: Props): Promise<Buffer> {
  registerFonts();
  return Buffer.from(await renderToBuffer(<EditionDocument {...props} />));
}

// A quick sanity check on bytes before they are stored: a real PDF header and at least the cover,
// the contents and one story page.
export function pdfPageCount(bytes: Uint8Array): number {
  const head = Buffer.from(bytes.subarray(0, 8)).toString("latin1");
  if (!head.startsWith("%PDF-")) return 0;
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?![s\w])/g);
  return matches ? matches.length : 0;
}
