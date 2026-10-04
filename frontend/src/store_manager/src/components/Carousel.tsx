import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import './Carousel.css';

/** ‹  • •  › controls under the delivery screens. */
export default function CarouselNav({ count, index, onChange }: { count: number; index: number; onChange: (i: number) => void }) {
  if (count <= 1) return <div />;
  return (
    <div className="sm-carousel">
      <button type="button" className="sm-carousel__arrow" onClick={() => onChange(index - 1)} disabled={index <= 0} aria-label="Previous delivery">
        <CaretLeft size={30} />
      </button>
      <div className="sm-carousel__dots" role="tablist">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Delivery ${i + 1}`}
            className={`sm-carousel__dot${i === index ? ' is-active' : ''}`}
            onClick={() => onChange(i)}
          />
        ))}
      </div>
      <button type="button" className="sm-carousel__arrow" onClick={() => onChange(index + 1)} disabled={index >= count - 1} aria-label="Next delivery">
        <CaretRight size={30} />
      </button>
    </div>
  );
}
