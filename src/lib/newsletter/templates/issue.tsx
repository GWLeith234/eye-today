import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";

import { COLORS, SANS, SERIF } from "./colors";

export type IssueStory = { title: string; dek: string | null; url: string; sponsored: boolean };

export type IssueDirectoryItem = { name: string; url: string; place: string; category: string };

export type IssueEmailProps = {
  listName: string;
  preheader: string;
  intro: string;
  stories: IssueStory[];
  // New directory listings. Empty or missing: the section is left out.
  directory?: IssueDirectoryItem[];
  postalAddress: string;
  siteUrl: string;
  unsubscribeUrl: string;
};

// Every value here is text, and React escapes it: the intro and story titles are never HTML.
export function IssueEmail({ listName, preheader, intro, stories, directory = [], postalAddress, siteUrl, unsubscribeUrl }: IssueEmailProps) {
  return (
    <Html lang="en">
      <Head />
      {preheader ? <Preview>{preheader}</Preview> : null}
      <Body style={{ backgroundColor: COLORS.paper, color: COLORS.ink, fontFamily: SANS, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px" }}>
          <Link href={siteUrl} style={{ color: COLORS.ink, textDecoration: "none" }}>
            <Heading as="h1" style={{ fontFamily: SERIF, fontSize: 34, margin: "0 0 4px" }}>
              Eye Today
            </Heading>
          </Link>
          <Text style={{ color: COLORS.muted, fontSize: 13, margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>
            {listName}
          </Text>
          <Hr style={{ borderColor: COLORS.ink, borderTopWidth: 2, margin: "0 0 20px" }} />

          {intro ? (
            <Text style={{ fontSize: 16, lineHeight: "24px", whiteSpace: "pre-wrap", margin: "0 0 24px" }}>{intro}</Text>
          ) : null}

          {stories.map((story) => (
            <Section key={story.url} style={{ margin: "0 0 22px" }}>
              {story.sponsored ? (
                <Text style={{ color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 2px" }}>
                  Sponsored
                </Text>
              ) : null}
              <Link href={story.url} style={{ color: COLORS.accent, fontFamily: SERIF, fontSize: 22, fontWeight: 700, lineHeight: "28px" }}>
                {story.title}
              </Link>
              {story.dek ? <Text style={{ fontSize: 15, lineHeight: "22px", margin: "4px 0 0" }}>{story.dek}</Text> : null}
            </Section>
          ))}

          {directory.length > 0 ? (
            <Section style={{ margin: "0 0 22px" }}>
              <Hr style={{ borderColor: COLORS.ink, borderTopWidth: 2, margin: "0 0 14px" }} />
              <Heading as="h2" style={{ fontFamily: SERIF, fontSize: 22, margin: "0 0 8px" }}>
                New in the directory
              </Heading>
              {directory.map((item) => (
                <Text key={item.url} style={{ fontSize: 15, lineHeight: "22px", margin: "0 0 8px" }}>
                  <Link href={item.url} style={{ color: COLORS.accent, fontWeight: 700 }}>
                    {item.name}
                  </Link>
                  {" — "}
                  {[item.category, item.place].filter(Boolean).join(", ")}
                </Text>
              ))}
              <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: "18px", margin: "8px 0 0" }}>
                A listing is not an endorsement. {MEDICAL_DISCLAIMER}
              </Text>
            </Section>
          ) : null}

          <Hr style={{ borderColor: COLORS.rule, margin: "24px 0 16px" }} />
          <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: "18px", margin: "0 0 8px" }}>
            You are receiving this because you asked Eye Today to email you the {listName}. Information only — not medical advice.
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: "18px", margin: "0 0 8px" }}>{postalAddress}</Text>
          <Text style={{ fontSize: 12, margin: 0 }}>
            <Link href={unsubscribeUrl} style={{ color: COLORS.accent }}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
