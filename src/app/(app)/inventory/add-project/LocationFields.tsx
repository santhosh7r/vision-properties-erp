// Project location fields for the Add Project form. District is a fixed
// dropdown fed by the app-wide DISTRICTS master; City is a manual text input and
// Pincode is an optional manual input shown after City. The earlier India Post
// auto-fetch was removed — pincode is captured for reference and is not
// persisted to the projects table today.
import { DISTRICTS } from "@/lib/options";

export default function LocationFields() {
  return (
    <>
      <div>
        <label className="label">District *</label>
        <select name="district" className="select" required defaultValue="">
          <option value="" disabled>
            Select district
          </option>
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">City *</label>
        <input name="city" className="input" required placeholder="e.g. Velachery" />
      </div>
      <div>
        <label className="label">Pincode</label>
        <input
          name="pincode"
          className="input"
          inputMode="numeric"
          maxLength={6}
          placeholder="6-digit PIN"
        />
      </div>
    </>
  );
}
