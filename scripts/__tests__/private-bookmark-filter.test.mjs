/**
 * Tests for scripts/lib/private-bookmark-filter.mjs — keeps logged-in admin
 * pages, private workspace files and identifier-bearing links out of the
 * tracked bookmark exports that scripts/parse-bookmarks.mjs regenerates
 * (ops#27). Synthetic URLs, plus a read of the tracked exports; no network.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPrivateBookmarkUrl } from '../lib/private-bookmark-filter.mjs';

const PRIVATE = [
  // private workspace documents and chats
  'https://docs.google.com/document/d/EXAMPLE_DOC_ID/edit',
  'https://drive.google.com/drive/folders/EXAMPLE_FOLDER_ID',
  'https://chatgpt.com/g/g-p-example/c/example-chat',
  'https://claude.ai/chat/00000000-0000-0000-0000-000000000000',
  'https://aistudio.google.com/prompts/EXAMPLE_PROMPT_ID',
  'https://stitch.withgoogle.com/projects/1234567890',
  // admin consoles and dashboards
  'https://example-store-1234.squarespace.com/config/settings/selling',
  'https://merchants.google.com/mc/merchantprofile/businessinfo/edit?a=123',
  'https://analytics.google.com/analytics/web/#/p123/reports/intelligenthome',
  'https://search.google.com/search-console?resource_id=sc-domain%3Aexample.com',
  'https://console.cloud.google.com/apis/credentials?project=example-123',
  'https://supabase.com/dashboard/project/exampleref',
  'https://cargocollective.com/example/admin',
  'https://editor.wix.com/html/editor/web/renderer/edit/example',
  'https://admin.microsoft.com/Adminportal/Home',
  'https://outlook.office.com/mail/inbox',
  'https://example.sharepoint.com/sites/team/Shared%20Documents',
  // an employer's internal source hosting
  'https://example.visualstudio.com/Project/_git/Repo',
  'https://dev.azure.com/example-org/Project/_git/Repo',
  // private design files and hosted prototypes
  'https://www.figma.com/files/team/123/recents-and-sharing?fuid=456',
  'https://www.figma.com/community/plugin/1?fuid=456',
  'https://app.paper.design/file/EXAMPLE/EXAMPLE',
  'https://www.magicpath.ai/files/123',
  'https://cloud.protopie.io/p/example?ui=true',
  'https://www.recraft.ai/project/example-id?projectType=vectorize',
  // identifier-bearing links and paid record lookups
  'https://example-bank.com/card-benefits/view-all?account_key=EXAMPLEKEY',
  'https://studio.youtube.com/channel/EXAMPLE/videos?token=EXAMPLE',
  'https://www.referenceusa.com/Account/LogOn?recordId=1',
  'https://shop.example.com/?utm_source=email&_kx=EXAMPLE_SUBSCRIBER_TOKEN',
  // personal profiles of named individuals
  'https://www.linkedin.com/in/example-person/',
];

const PUBLIC = [
  'https://support.google.com/a/answer/33327',
  'https://aistudio.google.com/prompts/new_chat',
  'https://www.figma.com/community/file/1268615283036362769',
  'https://www.figma.com/blog/introducing-codex-to-figma/',
  'https://support.squarespace.com/hc/en-us/articles/206566737-Form-blocks',
  'https://www.squarespace.com/blog/audience-development',
  'https://www.linkedin.com/feed/update/urn:li:activity:1/',
  'https://github.com/adobe/aem-project-archetype',
  'https://marketingplatform.google.com/about/tag-manager/',
  'https://www.youtube.com/watch?v=example',
  'https://chatgpt.com/',
  'not a url',
];

test('flags private, admin and identifier-bearing links', () => {
  for (const url of PRIVATE) assert.equal(isPrivateBookmarkUrl(url), true, url);
});

test('keeps public reference links', () => {
  for (const url of PUBLIC) assert.equal(isPrivateBookmarkUrl(url), false, url);
});

test('tracked bookmark exports carry no private links', () => {
  const root = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'docs',
    'knowledge',
  );
  const exports = fs
    .readdirSync(root, { recursive: true })
    .map(String)
    .filter((rel) => rel.split(path.sep).join('/').endsWith('bookmarks/index.md'));
  assert.ok(exports.length > 0, 'expected tracked bookmark exports under docs/knowledge');
  for (const rel of exports) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const [, url] of text.matchAll(/^- \[.*\]\((.*)\)$/gm)) {
      assert.equal(isPrivateBookmarkUrl(url), false, `${rel}: ${url}`);
    }
  }
});
