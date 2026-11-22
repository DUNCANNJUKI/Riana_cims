const fs = require('node:fs/promises');
const { jsPDF } = require('jspdf');
const sharp = require('sharp');

async function signedCompletionReport(pool, { requestId, token, resolveSignature }) {
  const [rows] = await pool.query(`SELECT r.*, cr.ticket_number, cr.request_title, c.client_name,
      a.id AS acceptance_id, a.client_representative_name, a.client_representative_designation,
      a.sign_off_method, a.accepted_at, a.otp_verified_at, a.signature_image_path,
      a.declaration_text, a.feedback_rating, a.feedback_comment
    FROM crms_completion_reports r
    JOIN crms_change_requests cr ON cr.id COLLATE utf8mb4_unicode_ci = r.change_request_id COLLATE utf8mb4_unicode_ci
    JOIN clients c ON c.id COLLATE utf8mb4_unicode_ci = cr.client_id COLLATE utf8mb4_unicode_ci
    JOIN crms_client_acceptances a ON a.completion_report_id COLLATE utf8mb4_unicode_ci = r.id COLLATE utf8mb4_unicode_ci
    WHERE ${token ? 'r.acceptance_token = ? AND r.token_expires_at > NOW()' : 'cr.id = ?'}
      AND r.status = 'accepted' AND cr.status IN ('client_accepted','closed_client_accepted')
      AND a.declaration_confirmed = TRUE
      AND ((a.sign_off_method = 'otp' AND a.otp_verified_at IS NOT NULL)
        OR (a.sign_off_method = 'signature' AND a.signature_image_path IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM crms_completion_reports newer WHERE newer.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci AND newer.version_number > r.version_number)
      AND NOT EXISTS (SELECT 1 FROM crms_client_action_responses response WHERE response.change_request_id COLLATE utf8mb4_unicode_ci = cr.id COLLATE utf8mb4_unicode_ci AND response.resolved = FALSE)
    ORDER BY r.version_number DESC LIMIT 1`, [token || requestId]);
  if (!rows.length) throw Object.assign(new Error('A verified client sign-off is required for this report.'), { status: 404 });
  const row = rows[0];
  const doc = new jsPDF();
  let y = 20;
  const text = (heading, value) => {
    if (value == null || value === '') return;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(8, 111, 118);
    doc.text(heading, 15, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59);
    for (const line of doc.splitTextToSize(String(value), 180)) {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(line, 15, y); y += 5;
    }
    y += 5;
  };
  text('RIANA CIMS | CLIENT COMPLETION REPORT', `${row.ticket_number} | Version ${row.version_number}`);
  text('Client', row.client_name);
  text('Change requested', row.request_title);
  for (const [label, key] of [['Summary', 'summary_of_change'], ['Implemented solution', 'implemented_solution'], ['Deliverables', 'deliverables'], ['Issues resolved', 'issues_resolved'], ['Testing performed', 'testing_performed'], ['Known limitations', 'known_limitations'], ['Recommendations', 'client_recommendations']]) text(label, row[key]);
  doc.addPage(); y = 20;
  text('VERIFIED CLIENT SIGN-OFF', `${row.client_representative_name}\n${row.client_representative_designation}\nAccepted: ${new Date(row.accepted_at).toISOString()}\nVerification: ${row.sign_off_method === 'signature' ? 'Electronic signature' : 'One-time password (OTP)'}`);
  text('Declaration', row.declaration_text);
  if (row.sign_off_method === 'signature') {
    const source = resolveSignature?.(row.signature_image_path);
    if (!source) throw Object.assign(new Error('The recorded signature is unavailable. Contact your Account Manager.'), { status: 409 });
    const image = await sharp(await fs.readFile(source), { limitInputPixels: 16000000 }).rotate().resize(1000, 400, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const meta = await sharp(image).metadata();
    const w = Math.min(90, 35 * meta.width / meta.height), h = w * meta.height / meta.width;
    doc.addImage(new Uint8Array(image), 'PNG', 15, y, w, h); y += h + 10;
  } else text('OTP attestation', `Confirmed by ${row.client_representative_name} using a verified one-time password at ${new Date(row.otp_verified_at).toISOString()}. No handwritten signature was supplied for this method.`);
  text('Feedback', [row.feedback_rating != null ? `${row.feedback_rating} / 5` : '', row.feedback_comment].filter(Boolean).join('\n'));
  text('Verification reference', row.acceptance_id);
  return { buffer: Buffer.from(doc.output('arraybuffer')), filename: `${String(row.ticket_number).replace(/[^a-zA-Z0-9_-]/g, '_')}-signed-completion.pdf` };
}

module.exports = { signedCompletionReport };
