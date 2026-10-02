import { useMemo, useRef, useState, useCallback } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { Product } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import './ProductSearch.css';

interface Props {
  products: Product[];
  onPick: (p: Product) => void;
  autoFocus?: boolean;
}

/** "Search item" input with a suggestions list (Add Product row). */
export default function ProductSearch({ products, onPick, autoFocus }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!!autoFocus);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => !s || p.name.toLowerCase().includes(s)).slice(0, 8);
  }, [q, products]);

  const pick = (p: Product) => { onPick(p); setQ(''); setOpen(false); };

  return (
    <div className="sm-search" ref={ref}>
      <MagnifyingGlass size={20} className="sm-search__icon" aria-hidden />
      <input
        value={q}
        placeholder="Search item"
        autoFocus={autoFocus}
        aria-label="Search item"
        aria-autocomplete="list"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter' && matches[hi]) { e.preventDefault(); pick(matches[hi]); }
        }}
      />
      {open && (
        <ul className="sm-search__list" role="listbox">
          {matches.length ? (
            matches.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === hi}>
                <button type="button" className={i === hi ? 'is-hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => pick(p)}>
                  {p.name}
                </button>
              </li>
            ))
          ) : (
            <li className="sm-search__none">No matching products</li>
          )}
        </ul>
      )}
    </div>
  );
}
