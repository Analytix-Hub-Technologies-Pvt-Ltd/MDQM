const TASKS = [
  { id: "ST-442", title: "Resolve duplicate customer keys", priority: "P1", owner: "Steward Team A" },
  { id: "ST-451", title: "Fix invalid tax-id patterns", priority: "P1", owner: "Steward Team B" },
  { id: "ST-468", title: "Review quarantine batch from ERP", priority: "P2", owner: "Steward Team A" },
  { id: "ST-476", title: "Certify golden record merge result", priority: "P2", owner: "Steward Team C" },
];

export default function StewardWorkQueuePanel() {
  return (
    <section className="enterprise-card p-4">
      <h3 className="enterprise-title mb-3">Stewardship Work Queue</h3>
      <div className="space-y-2">
        {TASKS.map((task) => (
          <div key={task.id} className="border border-[#233252] rounded-md p-3 bg-[#0f1b31]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[#d7e3f7]">{task.title}</p>
                <p className="text-xs text-[#7f95b6] mt-1">{task.id} · {task.owner}</p>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded border ${task.priority === "P1" ? "text-red-300 border-red-400/40 bg-red-950/40" : "text-amber-300 border-amber-400/40 bg-amber-950/40"}`}>
                {task.priority}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
