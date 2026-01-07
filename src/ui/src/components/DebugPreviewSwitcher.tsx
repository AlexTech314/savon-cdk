import { useState } from "react";

// Stub component - CSV data removed for production build
// This will be wired to the real API later

interface BusinessEntry {
  place_id: string;
  friendly_slug: string;
  business_name: string;
  business_type: string;
  city: string;
}

// Empty placeholder - will fetch from API in production
const businesses: BusinessEntry[] = [];

export default function DebugPreviewSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredBusinesses = businesses.filter(
    (b) =>
      b.business_name.toLowerCase().includes(filter.toLowerCase()) ||
      b.business_type.toLowerCase().includes(filter.toLowerCase()) ||
      b.city.toLowerCase().includes(filter.toLowerCase())
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-full shadow-lg font-medium text-sm transition-colors"
      >
        🔧 Preview Switcher
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[70vh] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-zinc-700 bg-zinc-800">
        <span className="font-semibold text-white text-sm">
          Preview Switcher ({businesses.length} businesses)
        </span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="p-2 border-b border-zinc-700">
        <input
          type="text"
          placeholder="Filter by name, type, or city..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
        />
      </div>

      <div className="overflow-y-auto flex-1">
        {filteredBusinesses.length === 0 && (
          <div className="p-4 text-center text-zinc-500 text-sm">
            No businesses loaded. Connect to API to fetch data.
          </div>
        )}
        {filteredBusinesses.map((business) => (
          <a
            key={business.place_id}
            href={`/preview/${business.friendly_slug || business.place_id}`}
            className="block px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800 transition-colors group"
          >
            <div className="text-sm font-medium text-white group-hover:text-violet-400 truncate">
              {business.business_name}
            </div>
            <div className="text-xs text-zinc-500 flex gap-2 mt-0.5">
              <span className="bg-zinc-800 px-1.5 py-0.5 rounded">
                {business.business_type}
              </span>
              <span>{business.city}</span>
            </div>
          </a>
        ))}
      </div>

      <div className="p-2 border-t border-zinc-700 bg-zinc-800 text-xs text-zinc-500 text-center">
        Click to view preview
      </div>
    </div>
  );
}
