import "server-only";

import { render } from "@react-email/render";

import { ConfirmEmail } from "./templates/confirm";
import { IssueEmail, type IssueEmailProps } from "./templates/issue";

export type Rendered = { html: string; text: string };

async function both(element: React.ReactElement): Promise<Rendered> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

export const renderIssue = (props: IssueEmailProps) => both(<IssueEmail {...props} />);

export const renderConfirm = (props: { listName: string; confirmUrl: string; postalAddress: string }) =>
  both(<ConfirmEmail {...props} />);
