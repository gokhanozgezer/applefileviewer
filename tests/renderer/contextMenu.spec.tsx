import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@renderer/components/ContextMenu';

function Harness({ items }: { items: ContextMenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        invoker
      </button>
      {open && <ContextMenu x={10} y={10} items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

function makeItems() {
  return ['Aç', 'Dışa aktar', 'Kopyala'].map((label) => ({ label, onClick: vi.fn() }));
}

function openMenu() {
  const invoker = screen.getByRole('button', { name: 'invoker' });
  invoker.focus();
  fireEvent.click(invoker);
  return invoker;
}

describe('ContextMenu klavye davranışı', () => {
  it('role=menu/menuitem ve açılışta ilk öğeye odak', () => {
    render(<Harness items={makeItems()} />);
    openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveFocus();
  });

  it('ArrowDown/ArrowUp döngüsel, Home/End uçlara gider', () => {
    render(<Harness items={makeItems()} />);
    openMenu();
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[0]).toHaveFocus(); // sondan başa sarar
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items[2]).toHaveFocus(); // baştan sona sarar
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(items[2]).toHaveFocus();
  });

  it('Esc kapatır ve odak menüyü açan öğeye döner', () => {
    render(<Harness items={makeItems()} />);
    const invoker = openMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(invoker).toHaveFocus();
  });

  it('öğe tıklanınca aksiyon çalışır, menü kapanır', () => {
    const items = makeItems();
    render(<Harness items={items} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dışa aktar' }));
    expect(items[1]!.onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('dışarı tıklama kapatır', () => {
    render(<Harness items={makeItems()} />);
    openMenu();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
