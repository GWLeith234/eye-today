import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

import { COLORS, SANS, SERIF } from "./colors";

export type IssueStory = { title: string; dek: string | null; url: string; sponsored: boolean };

export type IssueEmailProps = {
  listName: string;
  preheader: string;
  intro: string;
  stories: IssueStory[];
  postalAddress: string;
  siteUrl: string;
  unsubscribeUrl: string;
};

// Every value here is text, and React escapes it: the intro and story titles are never HTML.
export function IssueEmail({ listName, preheader, intro, stories, postalAddress, siteUrl, unsubscribeUrl }: IssueEmailProps) {
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
