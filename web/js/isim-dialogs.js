// SSim's dialogs (#405: out of mountISim): one at a time over the window (openDialog, closeDialog), and Force Constant /
// Force Clock of the selected signal (forceDialog), which add the force and echo its ssim force add command. They are
// ui.js's dialog() (#4762: its stack, keys, focus and close-once guard), put over SSim's window.
// mountDialogs(ctx) is called by mountISim where this code was.
import { dialog, h } from './ui.js';
import { fmtTime, parseTime, formatValue, parseValue, pathOf } from './isim.js';

/** A dialog's field of SSim: its label and its input (name: the field's, attrs: the input's own). */
export const field = (label, name, attrs = {}) => [h('label', {}, label), h('input', { name, ...attrs })];

/** { openDialog, closeDialog, forceDialog } of an SSim window. */
export function mountDialogs(ctx) {
  const { root, sim, addForce, echo } = ctx;

  let closeOpen = null;
  // the dialog open (one at a time: a new one closes the one open, which resolves false), over the window's root
  function openDialog(spec) {
    closeDialog();
    let mine = null;
    const done = dialog({ ...spec, host: root, className: `isim-dlg ${spec.className || ''}`, onOpen: o => { mine = closeOpen = o.close; spec.onOpen?.(o); } });
    done.then(() => { if (closeOpen === mine) closeOpen = null; });
    return done;
  }
  function closeDialog() { closeOpen?.(false); }
  function forceDialog(sig, kind) {
    const t = sig.t;
    const isEnum = t.kind === 'enum';
    const defRadix = t.kind === 'int' ? 'dec' : 'bin';
    const clock = kind === 'clock';
    const one = t.kind === 'enum' ? t.names[1] ?? t.names[0] : t.kind === 'bool' ? 'TRUE' : '1';
    const zero = t.kind === 'enum' ? t.names[0] : t.kind === 'bool' ? 'FALSE' : '0';
    const radix = h('select', { name: 'radix', disabled: isEnum }, ...[['bin', 'Binary'], ['hex', 'Hexadecimal'], ['dec', 'Decimal'], ['oct', 'Octal'], ['ascii', 'ASCII']].map(([v, l]) => h('option', { value: v }, l)));
    radix.value = defRadix;
    const err = h('div', { class: 'dlg-err' });
    const body = h('div', {},
      h('div', { class: 'hint' }, clock ? 'Specify the properties of the clock to be applied to the selected signal.' : 'Specify the value to force the selected signal to.'),
      h('div', { class: 'form-grid isim-dlg-grid' },
        ...field('Signal Name:', 'sig', { value: pathOf(sig), readonly: true, 'data-no-i18n': '' }),
        h('label', {}, 'Value Radix:'), radix,
        ...(clock ? [
          ...field('Leading Edge Value:', 'lead', { value: zero }), ...field('Trailing Edge Value:', 'trail', { value: one }),
          ...field('Starting at Time Offset:', 'start', { value: '0' }), ...field('Cancel after Time Offset:', 'cancel', { value: '', placeholder: '(never)' }),
          ...field('Period:', 'period', { value: '10 ns' }), ...field('Duty Cycle (%):', 'duty', { value: '50' }),
        ] : [
          ...field('Force to Value:', 'value', { value: formatValue(sim.valueAt(sig, sim.now), t, isEnum || t.kind === 'bool' ? 'default' : defRadix === 'dec' ? 'sdec' : 'bin') }),
          ...field('Starting at Time Offset:', 'start', { value: '0' }), ...field('Cancel after Time Offset:', 'cancel', { value: '', placeholder: '(never)' }),
        ])),
      h('div', { class: 'dlg-note' }, `Time offsets are relative to the current simulation time (${fmtTime(sim.now)}); default unit is ns.`),
      err);
    const q = (n) => body.querySelector(`[name="${n}"]`);
    const apply = () => {
      try {
        const rdx = isEnum ? 'default' : q('radix').value;
        const start = sim.now + (q('start').value.trim() ? parseTime(q('start').value, 'ns') : 0);
        const cancelOff = q('cancel').value.trim() ? parseTime(q('cancel').value, 'ns') : null;
        if (isNaN(start) || (cancelOff !== null && isNaN(cancelOff))) throw new Error('invalid time offset');
        const cancel = cancelOff == null ? null : sim.now + cancelOff;
        if (clock) {
          const lead = parseValue(q('lead').value, t, rdx), trail = parseValue(q('trail').value, t, rdx);
          const period = parseTime(q('period').value, 'ns');
          const duty = parseFloat(q('duty').value);
          if (!(period >= 2)) throw new Error('period must be at least 2 ps');
          if (!(duty > 0 && duty < 100)) throw new Error('duty cycle must be between 0 and 100');
          const hi = Math.max(1, Math.min(period - 1, Math.round(period * duty / 100)));
          addForce(sig, { pattern: [{ off: 0, val: lead }, { off: hi, val: trail }], start, repeat: period, cancel, desc: `clock ${q('lead').value}/${q('trail').value} period ${fmtTime(period)} duty ${duty}%` });
          echo(`ssim force add ${pathOf(sig)} ${q('lead').value} -radix ${rdx === 'default' ? 'bin' : rdx}${start > sim.now ? ` -time ${fmtTime(start - sim.now)}` : ''} -value ${q('trail').value} -time ${fmtTime(hi + start - sim.now)} -repeat ${fmtTime(period)}${cancelOff != null ? ` -cancel ${fmtTime(cancelOff)}` : ''}`);
        } else {
          const val = parseValue(q('value').value, t, rdx);
          addForce(sig, { pattern: [{ off: 0, val }], start, cancel, desc: `constant ${q('value').value}` });
          echo(`ssim force add ${pathOf(sig)} ${q('value').value} -radix ${rdx === 'default' ? 'bin' : rdx}${start > sim.now ? ` -time ${fmtTime(start - sim.now)}` : ''}${cancelOff != null ? ` -cancel ${fmtTime(cancelOff)}` : ''}`);
        }
        err.textContent = '';
        return true;
      } catch (e) { err.textContent = e.message; return false; }
    };
    return openDialog({
      title: clock ? 'Define Clock' : 'Force Selected Signal', width: 420, body,
      buttons: [{ label: 'OK', primary: true, value: true, validate: apply, attrs: { 'data-a': 'ok' } }, { label: 'Cancel', value: null, attrs: { 'data-a': 'cancel' } },
        { label: 'Apply', keep: true, validate: apply, attrs: { 'data-a': 'apply' } }],
      // (the value to force focused and selected, not the signal's name)
      onOpen: () => { const first = q(clock ? 'lead' : 'value'); first.dataset.autofocus = ''; first.select(); },
    });
  }

  return { openDialog, closeDialog, forceDialog };
}
