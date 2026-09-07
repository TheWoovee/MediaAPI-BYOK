import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SchemaForm } from './SchemaForm';
import type { ParamSchema } from '@shared/types';

afterEach(cleanup);

function setup(params: Record<string, ParamSchema>, values: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const result = render(<SchemaForm params={params} values={values} onChange={onChange} />);
  return { onChange, ...result };
}

describe('SchemaForm', () => {
  it('renders a string input', () => {
    setup({ name: { type: 'string', label: 'Name', required: true } });
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('renders a number slider when min/max provided', () => {
    setup({
      width: { type: 'integer', label: 'Width', min: 256, max: 1024, step: 64, default: 512 },
    }, { width: 512 });
    expect(screen.getByText('Width')).toBeTruthy();
    const input = screen.getByRole('spinbutton');
    expect(input).toBeTruthy();
  });

  it('fires onChange on string input', () => {
    const { onChange } = setup(
      { prompt: { type: 'string', label: 'Prompt' } },
      { prompt: '' },
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledWith({ prompt: 'hello' });
  });

  it('renders enum as segmented controls', () => {
    setup({
      style: { type: 'enum', label: 'Style', enum: ['natural', 'vivid'], default: 'natural' },
    }, { style: 'natural' });
    expect(screen.getByText('natural')).toBeTruthy();
    expect(screen.getByText('vivid')).toBeTruthy();
  });

  it('fires onChange on enum click', () => {
    const { onChange } = setup(
      { style: { type: 'enum', label: 'Style', enum: ['natural', 'vivid'], default: 'natural' } },
      { style: 'natural' },
    );
    fireEvent.click(screen.getByText('vivid'));
    expect(onChange).toHaveBeenCalledWith({ style: 'vivid' });
  });

  it('renders boolean as checkbox', () => {
    setup({ hd: { type: 'boolean', label: 'HD' } }, { hd: false });
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('fires onChange on boolean toggle', () => {
    const { onChange } = setup(
      { hd: { type: 'boolean', label: 'HD' } },
      { hd: false },
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith({ hd: true });
  });

  it('respects showWhen visibility', () => {
    setup(
      {
        mode: { type: 'enum', label: 'Mode', enum: ['simple', 'advanced'], default: 'simple' },
        detail: { type: 'string', label: 'Detail', showWhen: { field: 'mode', value: 'advanced' } },
      },
      { mode: 'simple' },
    );
    expect(screen.getByText('Mode')).toBeTruthy();
    expect(screen.queryByText('Detail')).toBeNull();
  });

  it('shows field when showWhen condition met', () => {
    setup(
      {
        mode: { type: 'enum', label: 'Mode', enum: ['simple', 'advanced'], default: 'advanced' },
        detail: { type: 'string', label: 'Detail', showWhen: { field: 'mode', value: 'advanced' } },
      },
      { mode: 'advanced' },
    );
    expect(screen.getByText('Detail')).toBeTruthy();
  });

  it('renders advanced fields collapsed by default', () => {
    setup({
      prompt: { type: 'string', label: 'Prompt' },
      cfg: { type: 'number', label: 'CFG Scale', advanced: true, min: 1, max: 20, default: 7 },
    });
    expect(screen.getByText('Prompt')).toBeTruthy();
    expect(screen.getByText('Advanced (1)')).toBeTruthy();
    expect(screen.queryByText('CFG Scale')).toBeNull();
  });

  it('expands advanced fields on click', () => {
    setup({
      prompt: { type: 'string', label: 'Prompt' },
      cfg: { type: 'number', label: 'CFG Scale', advanced: true, min: 1, max: 20, default: 7 },
    }, { cfg: 7 });
    fireEvent.click(screen.getByText('Advanced (1)'));
    expect(screen.getByText('CFG Scale')).toBeTruthy();
  });

  it('uses default values', () => {
    setup(
      { width: { type: 'integer', label: 'Width', default: 512, min: 128, max: 2048 } },
      {},
    );
    const input = screen.getByRole('spinbutton');
    expect((input as HTMLInputElement).value).toBe('512');
  });

  it('renders image drop zone', () => {
    setup({ image: { type: 'image', label: 'Input Image' } });
    expect(screen.getByText('Drop image file')).toBeTruthy();
  });

  it('renders mask drop zone', () => {
    setup({ mask: { type: 'mask', label: 'Mask' } });
    expect(screen.getByText('Drop mask file')).toBeTruthy();
  });

  it('renders video drop zone', () => {
    setup({ video: { type: 'video', label: 'Source Video' } });
    expect(screen.getByText('Drop video file')).toBeTruthy();
  });

  it('displays unit label', () => {
    setup({ steps: { type: 'integer', label: 'Steps', unit: 'steps', min: 1, max: 100, default: 20 } }, { steps: 20 });
    expect(screen.getByText('(steps)')).toBeTruthy();
  });

  it('renders help text', () => {
    setup({ prompt: { type: 'string', label: 'Prompt', help: 'Describe what you want to see' } });
    expect(screen.getByText('Describe what you want to see')).toBeTruthy();
  });
});
