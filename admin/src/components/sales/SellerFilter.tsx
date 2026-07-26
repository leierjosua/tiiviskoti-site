import { useEmployees } from "@/hooks/useEmployees";
import { selectCls } from "@/lib/constants";

interface SellerFilterProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SellerFilter({ value, onChange, className }: SellerFilterProps) {
  const { data: sellers = [] } = useEmployees("seller");

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${selectCls} ${className ?? "!w-44"}`}
    >
      <option value="">Kaikki myyjät</option>
      {sellers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.first_name} {s.last_name}
        </option>
      ))}
    </select>
  );
}
