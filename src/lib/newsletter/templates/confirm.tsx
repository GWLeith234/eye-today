import { Body, Button, Container, Head, Heading, Html, Text } from "@react-email/components";

import { COLORS, SANS, SERIF } from "./colors";

export function ConfirmEmail({ listName, confirmUrl, postalAddress }: { listName: string; confirmUrl: string; postalAddress: string }) {
  return (
    <Html lang="en">
      <Head />
      <Body style={{ backgroundColor: COLORS.paper, color: COLORS.ink, fontFamily: SANS, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px" }}>
          <Heading as="h1" style={{ fontFamily: SERIF, fontSize: 30, margin: "0 0 16px" }}>
            Eye Today
          </Heading>
          <Text style={{ fontSize: 16, lineHeight: "24px" }}>
            Someone asked Eye Today to email the {listName} to this address. To confirm, press the button. The link works for 48 hours.
          </Text>
          <Button href={confirmUrl} style={{ backgroundColor: COLORS.accent, color: "#ffffff", padding: "12px 20px", fontSize: 16, borderRadius: 4 }}>
            Confirm my subscription
          </Button>
          <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: "20px" }}>
            If that wasn&apos;t you, ignore this message and nothing will be sent.
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 12 }}>{postalAddress}</Text>
        </Container>
      </Body>
    </Html>
  );
}
