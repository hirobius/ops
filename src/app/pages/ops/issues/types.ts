export interface Issue {
  repo: string; // "owner/name"
  number: number;
  title: string;
  url: string;
  state: string;
  labels: string[];
  updated_at: string;
}

export interface IssuesResponse {
  issues: Issue[];
}

/** A stable ref for selection + clipboard: "owner/repo#123". */
export const issueRef = (i: Issue): string => `${i.repo}#${i.number}`;
