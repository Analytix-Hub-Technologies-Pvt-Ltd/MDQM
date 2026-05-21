/** Square toggle used in validation rules editor. */
export default function CustomToggle({ isActive, onToggle, variant = "classic" }) {
  const active = variant === "enterprise"
    ? "bg-[#2a4a7a] border-[#4f8cff]"
    : "bg-[#23243B] border-[#23243B]";
  const trackOff = variant === "enterprise"
    ? "bg-transparent border-[#2a3f63]"
    : "bg-transparent border-gray-300";

  return (
    <div
      onClick={onToggle}
      className={`w-12 h-6 cursor-pointer flex items-center rounded-xl p-1 transition-all duration-300 border group ${
        isActive ? active : trackOff
      } hover:border-[#4f8cff]`}
      role="switch"
      aria-checked={isActive}
    >
      <div
        className={`w-4 h-4 shadow-sm transition-all rounded-lg duration-300 transform ${
          isActive ? "translate-x-6 bg-white" : "translate-x-0 bg-gray-400 group-hover:bg-[#9ab0d1]"
        }`}
      />
    </div>
  );
}
