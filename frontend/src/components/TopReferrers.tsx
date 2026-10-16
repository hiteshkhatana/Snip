import { TopReferrer } from "../api";

export function TopReferrers({ topReferrers }: { topReferrers: TopReferrer[] }) {
  if (topReferrers.length === 0) {
    return <p>No clicks recorded yet, so there are no referrers to show.</p>;
  }

  return (
    <table className="referrers-table">
      <thead>
        <tr>
          <th>Referrer</th>
          <th>Clicks</th>
        </tr>
      </thead>
      <tbody>
        {topReferrers.map((entry) => (
          <tr key={entry.referrer}>
            <td>{entry.referrer}</td>
            <td>{entry.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
