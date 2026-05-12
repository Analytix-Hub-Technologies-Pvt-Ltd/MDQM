export default function StatusCard({ label, status, description }) {
  const isGood = String(status || "").toLowerCase() === "healthy";
  return (
    <article className="enterprise-card p-4">
      <p className="enterprise-title">{label}</p>
      <p className={`text-lg mt-2 font-semibold ${isGood ? "text-green-400" : "text-amber-300"}`}>{status}</p>
      {description ? <p className="text-sm text-[#7f95b6] mt-1">{description}</p> : null}
    </article>
  );
}
