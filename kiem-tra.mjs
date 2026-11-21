// Bộ canh gác ShopMartAI — kiểm tra sức khỏe mọi web/database, mở "phiếu sự cố" (GitHub Issue) khi sập,
// tự đóng phiếu khi sống lại. GitHub gửi email cho chủ kho mỗi khi có phiếu mới hoặc bình luận.
// Không chứa bất kỳ khóa bí mật nào: chỉ dùng GITHUB_TOKEN mặc định của Actions.
import { readFile, writeFile } from 'node:fs/promises';

const SO_LAN_THU = Number(process.env.SO_LAN_THU || 3);   // phải hỏng đủ 3 lần liên tiếp mới báo
const CACH_GIAY = Number(process.env.CACH_GIAY || 20);    // giữa các lần thử
const HET_GIO_MS = Number(process.env.HET_GIO_MS || 15000);
const KHO = process.env.GITHUB_REPOSITORY;                // "chủ/kho"
const TOKEN = process.env.GITHUB_TOKEN;
const NHAN = 'su-co';
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

async function thu1Lan(m) {
  const t0 = Date.now();
  try {
    const r = await fetch(m.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(HET_GIO_MS),
      headers: { 'user-agent': 'ShopMartAI-CanhGac/1.0 (+github actions)', 'cache-control': 'no-cache' },
    });
    const ms = Date.now() - t0;
    if (!m.dat.includes(r.status)) return { ok: false, ms, ly_do: `HTTP ${r.status}` };
    if (m.chua) {
      const body = await r.text();
      if (!body.includes(m.chua)) return { ok: false, ms, ly_do: `thiếu nội dung ${m.chua}` };
    }
    return { ok: true, ms };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, ly_do: e.name === 'TimeoutError' ? `quá ${HET_GIO_MS / 1000} giây` : (e.cause?.code || e.message) };
  }
}

export async function kiemTra(m, soLan = SO_LAN_THU, cach = CACH_GIAY) {
  let kq;
  for (let i = 1; i <= soLan; i++) {
    kq = await thu1Lan(m);
    if (kq.ok) return { ...kq, lan: i };
    if (i < soLan) await ngu(cach * 1000);
  }
  return { ...kq, lan: soLan };
}

async function gh(path, opt = {}) {
  const r = await fetch(`https://api.github.com/repos/${KHO}${path}`, {
    ...opt,
    headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', ...(opt.headers || {}) },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

const tieuDe = (m) => `🔴 SẬP: ${m.ten}`;
const gioVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) + ' (giờ VN)';

async function main() {
  const ds = JSON.parse(await readFile(new URL('./muc-tieu.json', import.meta.url), 'utf8'));
  const kq = await Promise.all(ds.map(async (m) => ({ m, r: await kiemTra(m) })));
  for (const { m, r } of kq) console.log(`${r.ok ? '✅' : '❌'} ${m.ten} — ${r.ok ? r.ms + ' ms' : r.ly_do}`);

  const trangThai = Object.fromEntries(kq.map(({ m, r }) => [m.ten, r.ok ? 'song' : 'sap']));
  if (KHO && TOKEN) {
    const mo = await gh(`/issues?state=open&labels=${NHAN}&per_page=100`);
    for (const { m, r } of kq) {
      const phieu = mo.find((i) => i.title === tieuDe(m));
      if (!r.ok && !phieu) {
        await gh('/issues', { method: 'POST', body: JSON.stringify({
          title: tieuDe(m), labels: [NHAN],
          body: `**${m.ten}** không trả lời đúng sau ${r.lan} lần thử (cách nhau ${CACH_GIAY} giây).\n\n- Địa chỉ: ${m.url}\n- Lỗi: ${r.ly_do}\n- Lúc: ${gioVN()}\n\nPhiếu này tự đóng khi web sống lại.`,
        }) });
        console.log(`  → mở phiếu sự cố: ${m.ten}`);
      } else if (r.ok && phieu) {
        await gh(`/issues/${phieu.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `✅ Đã sống lại lúc ${gioVN()} (phản hồi ${r.ms} ms).` }) });
        await gh(`/issues/${phieu.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
        console.log(`  → đóng phiếu: ${m.ten}`);
      }
    }
  }
  await writeFile(new URL('./trang-thai.json', import.meta.url), JSON.stringify(trangThai, null, 2) + '\n');
  const sap = kq.filter((x) => !x.r.ok).length;
  console.log(`\nTổng: ${kq.length - sap}/${kq.length} đang sống.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
