interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search..."
}: SearchFieldProps) {
  return (
    <div className="relative mb-6 group">
      <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
        <svg
          aria-hidden="true"
          className="w-5 h-5 text-gray-700"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="10" cy="10" r="7"></circle>
          <path d="M21 21l-4.35-4.35"></path>
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full p-2 pl-9 rounded-md text-gray-700 focus:outline-none text-small input-search bg-gray-800 placeholder-gray-700"
      />
    </div>
  );
} 