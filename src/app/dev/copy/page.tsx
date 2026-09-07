import {
  identificationFlagCopy,
  itemStatusCopy,
  identificationStatusCopy,
  failureReasonCopy,
  storageCopy,
  acquiredViaCopy,
  rawConditionTierCopy,
  autoTypeCopy,
  confidenceCopy,
  saleTypeCopy,
  helpPanelContent,
} from '@/ui/copy';

function Section({
  title,
  entries,
}: {
  title: string;
  entries: Record<string, string>;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Copy</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(entries).map(([key, value]) => (
            <tr key={key}>
              <td>
                <code>{key}</code>
              </td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HelpSection({
  entries,
}: {
  entries: Record<string, { title: string; body: string }>;
}) {
  return (
    <section>
      <h2>Help Panel Content</h2>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Title</th>
            <th>Body</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(entries).map(([key, { title, body }]) => (
            <tr key={key}>
              <td>
                <code>{key}</code>
              </td>
              <td>{title}</td>
              <td>{body}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function CopyDevPage() {
  return (
    <main>
      <h1>Copy Map Review</h1>
      <p>Dev-only page. Every user-facing string, organized by family.</p>

      <Section
        title="Identification Flags"
        entries={identificationFlagCopy}
      />
      <Section title="Item Status" entries={itemStatusCopy} />
      <Section
        title="Identification Status"
        entries={identificationStatusCopy}
      />
      <Section title="Failure Reason" entries={failureReasonCopy} />
      <Section title="Storage Type" entries={storageCopy} />
      <Section title="Acquired Via" entries={acquiredViaCopy} />
      <Section
        title="Raw Condition Tier"
        entries={rawConditionTierCopy}
      />
      <Section title="Auto Type" entries={autoTypeCopy} />
      <Section title="Confidence" entries={confidenceCopy} />
      <Section title="Sale Type" entries={saleTypeCopy} />

      <HelpSection entries={helpPanelContent} />
    </main>
  );
}
