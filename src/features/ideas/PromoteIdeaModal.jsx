import { X } from "lucide-react";

function TagIcon({ src, size = "chip" }) {
  if (!src) return null;
  return <img className={`tag-icon tag-icon-${size}`} src={src} alt="" aria-hidden="true" draggable={false} />;
}

function DialogHeader({ title, onClose }) {
  return (
    <div className="dialog-header">
      <h2>{title}</h2>
      <button className="icon-button" type="button" aria-label="Close dialog" data-dialog-close onClick={onClose}>
        <X size={18} />
      </button>
    </div>
  );
}

function formatShortDate(dateValue) {
  const value = String(dateValue ?? "");
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function PromoteIdeaModal({ promotion, days, tagAssets, onDayChange, onCancel, onContinue }) {
  const selectedDay = days.find((day) => day.id === promotion.dayId) ?? days[0];
  const category = promotion.idea.category;
  const categoryAsset = tagAssets?.category?.[category] ?? tagAssets?.category?.["Open Time"] ?? "";

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog promote-dialog" role="dialog" aria-modal="true" aria-label="Add idea as activity">
        <DialogHeader title="Add as activity" onClose={onCancel} />
        <div className="promote-summary">
          <TagIcon src={categoryAsset} size="chip" />
          <div>
            <strong>{promotion.idea.title}</strong>
            <span>{promotion.idea.city || "Japan"}</span>
          </div>
        </div>
        <label className="editor-field">
          Choose day
          <select value={selectedDay?.id ?? ""} onChange={(event) => onDayChange(event.target.value)}>
            {days.map((day) => (
              <option value={day.id} key={day.id}>
                Day {day.dayNumber} - {formatShortDate(day.date)} - {day.city}
              </option>
            ))}
          </select>
        </label>
        <p className="dialog-note">Next you can set the exact time, duration, map, cost, and notes.</p>
        <div className="dialog-actions">
          <button className="primary-button" type="button" onClick={onContinue} disabled={!selectedDay}>Continue</button>
        </div>
      </div>
    </div>
  );
}

export default PromoteIdeaModal;
