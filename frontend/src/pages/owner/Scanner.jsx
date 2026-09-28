import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CameraOff, Keyboard, ScanLine, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';
import { endpoints } from '@/lib/api';
import { dateShort, inr, time12 } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Input } from '@/components/ui/Field';
import { StatusActions } from './BookingRequests';

const READER_ID = 'hev-qr-reader';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** QR payload is JSON with booking_id; accept a bare UUID too (manual entry). */
function extractBookingId(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.booking_id) return String(parsed.booking_id);
  } catch {
    /* not JSON */
  }
  return text.match(UUID_RE)?.[0] || null;
}

export default function Scanner() {
  const scanner = useRef(null);
  const handling = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null); // { valid, booking?, error? }
  const [verifying, setVerifying] = useState(false);

  const stop = useCallback(async () => {
    const s = scanner.current;
    scanner.current = null;
    setScanning(false);
    if (s) {
      try {
        await s.stop();
        s.clear();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  useEffect(() => () => void stop(), [stop]);

  const verify = useCallback(
    async (raw) => {
      const id = extractBookingId(raw.trim());
      if (!id) {
        setResult({ valid: false, error: "This QR code isn't a HapticEV booking." });
        return;
      }
      setVerifying(true);
      try {
        const res = await endpoints.verifyQr(id);
        setResult(res);
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (err) {
        setResult({ valid: false, error: err.message });
      } finally {
        setVerifying(false);
      }
    },
    [],
  );

  const start = async () => {
    setResult(null);
    handling.current = false;
    try {
      const s = new Html5Qrcode(READER_ID, { verbose: false });
      scanner.current = s;
      setScanning(true);
      await s.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
        async (text) => {
          if (handling.current) return;
          handling.current = true;
          await stop();
          verify(text);
        },
        () => {},
      );
    } catch (err) {
      setScanning(false);
      scanner.current = null;
      toast.error(String(err).includes('Permission') ? 'Camera permission denied' : 'Could not start the camera');
    }
  };

  const b = result?.booking;

  return (
    <div>
      <PageHeader eyebrow="Check-in" title="Scan a booking QR" description="Point the camera at the driver's ticket to check the booking, then approve it or close the session." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl border border-line bg-ink-900">
            <div id={READER_ID} className="absolute inset-0 [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
            {!scanning && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <ScanLine className="mx-auto size-16 text-neutral-600" />
                  <p className="mt-3 text-sm text-neutral-500">Camera is off</p>
                </div>
              </div>
            )}
            {scanning && (
              <>
                {/* Corner brackets + sweeping laser */}
                <div className="pointer-events-none absolute inset-[15%]">
                  {['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'].map((c) => (
                    <span key={c} className={`absolute size-8 rounded-sm border-amber-400 ${c}`} />
                  ))}
                  <motion.span
                    className="absolute inset-x-0 h-0.5 bg-amber-400 shadow-[0_0_16px_2px_rgba(18,210,181,0.8)]"
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="mt-5 flex justify-center">
            {scanning ? (
              <Button variant="secondary" onClick={stop}>
                <CameraOff className="size-4" /> Stop camera
              </Button>
            ) : (
              <Button onClick={start} loading={verifying}>
                <Camera className="size-4" /> {result ? 'Scan another' : 'Start scanning'}
              </Button>
            )}
          </div>

          <form
            className="mt-6 flex gap-2 border-t border-line pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) verify(manual);
            }}
          >
            <div className="relative flex-1">
              <Keyboard className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
              <Input withIcon value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or paste the booking ID" />
            </div>
            <Button type="submit" variant="secondary" loading={verifying} disabled={!manual.trim()}>
              Verify
            </Button>
          </form>
        </Card>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass grid place-items-center rounded-2xl p-10 text-center text-sm text-neutral-500">
              The booking details will appear here after a scan.
            </motion.div>
          ) : !result.valid ? (
            <motion.div key="bad" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1, x: [0, -8, 8, -4, 0] }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 p-10 text-center">
              <ShieldAlert className="size-12 text-rose-300" />
              <h2 className="mt-4 text-xl uppercase">Invalid ticket</h2>
              <p className="mt-2 max-w-sm text-sm text-neutral-300">{result.error || 'Booking not found for your stations.'}</p>
            </motion.div>
          ) : (
            <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card className="overflow-hidden p-0">
                <div className="flex items-center gap-3 border-b border-amber-400/20 bg-amber-500/10 p-5">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
                    <ShieldCheck className="size-8 text-amber-300" />
                  </motion.span>
                  <div className="flex-1">
                    <p className="font-semibold text-bone">Valid booking</p>
                    <p className="font-mono text-xs text-neutral-400">{String(b.booking_id).slice(0, 18)}…</p>
                  </div>
                  <Badge status={b.status} />
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-6 text-sm">
                  <Item label="Driver" value={b.full_name} />
                  <Item label="Phone" value={b.phone} />
                  <Item label="Vehicle" value={[b.vehicle_number, b.vehicle_type].filter(Boolean).join(' · ') || '—'} />
                  <Item label="Paid" value={`${inr(b.amount_paid, { decimals: 2 })} · ${b.payment_status}`} />
                  <Item label="Station" value={b.station?.name} />
                  <Item label="Slot" value={`${dateShort(b.slot?.date)}, ${time12(b.slot?.start_time)} – ${time12(b.slot?.end_time)}`} />
                </dl>
                <div className="border-t border-line p-6">
                  <StatusActions booking={b} size="md" onChanged={(nb) => setResult((r) => ({ ...r, booking: nb }))} />
                  {['completed', 'cancelled', 'rejected'].includes(b.status) && <p className="text-sm text-neutral-400">No further action needed for this booking.</p>}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-bone">{value}</dd>
    </div>
  );
}
