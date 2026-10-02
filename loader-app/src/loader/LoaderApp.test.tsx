import { render, screen, fireEvent } from '@testing-library/react';
import LoaderApp from './LoaderApp';

describe('LoaderApp', () => {
  it('renders PIN entry screen', () => {
    render(<LoaderApp />);
    expect(screen.getByText('Enter your PIN')).toBeInTheDocument();
  });

  it('renders info panel with depot info', () => {
    render(<LoaderApp />);
    expect(screen.getByText('WayPath')).toBeInTheDocument();
    expect(screen.getByText(/Peliyagoda/)).toBeInTheDocument();
  });

  it('updates PIN display when keys are pressed', () => {
    render(<LoaderApp />);
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    // PIN display should show 1, 2, X, X
    expect(screen.getAllByText('X').length).toBe(2);
  });

  it('clears PIN when Clear is pressed', () => {
    render(<LoaderApp />);
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.getAllByText('X').length).toBe(4);
  });

  it('removes last digit when Backspace is pressed', () => {
    render(<LoaderApp />);
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByLabelText('Backspace'));
    expect(screen.getAllByText('X').length).toBe(3);
  });
});
