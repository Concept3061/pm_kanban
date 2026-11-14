import { priorities, type CardInput } from "@/lib/kanban";

type CardFieldInputsProps = {
  priority: CardInput["priority"];
  dueDate: string;
  onChange: (changes: Partial<Pick<CardInput, "priority" | "dueDate">>) => void;
};

const fieldClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)]";

export const CardFieldInputs = ({
  priority,
  dueDate,
  onChange,
}: CardFieldInputsProps) => (
  <div className="grid grid-cols-2 gap-2">
    <label className={labelClass}>
      Priority
      <select
        value={priority}
        onChange={(event) =>
          onChange({ priority: event.target.value as CardInput["priority"] })
        }
        className={`${fieldClass} mt-1 capitalize`}
      >
        {priorities.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
    <label className={labelClass}>
      Due date
      <input
        type="date"
        value={dueDate}
        onChange={(event) => onChange({ dueDate: event.target.value })}
        className={`${fieldClass} mt-1`}
      />
    </label>
  </div>
);
