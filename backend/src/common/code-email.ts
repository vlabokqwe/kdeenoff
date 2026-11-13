/**
 * Confirmation email. Colors are the account page: dark field, light type, indigo label.
 * The code is six digits, so it is safe to place in the markup.
 */

const SITE = "https://kdeenoff.bet/account/";

function codeDigits(code: unknown): string {
  const clean = String(code || "").replace(/\D/g, "").slice(0, 6);
  return clean.padStart(6, "0");
}

export function codeEmailText(code: string): string {
  const value = codeDigits(code);
  return [
    "Your KDeenOff code",
    "",
    value,
    "",
    "Enter it on your account page. It expires in 10 minutes.",
    SITE,
    "",
    "If you did not ask for this code, you can ignore this email.",
  ].join("\n");
}

export function codeEmailHtml(code: string): string {
  const value = codeDigits(code);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Your KDeenOff code</title>
</head>
<body style="margin:0;padding:0;background:#0c1218;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Your confirmation code expires in 10 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0c1218" style="background:#0c1218;">
  <tr>
    <td align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr>
          <td bgcolor="#161a24" style="padding:28px 28px 32px;background:#161a24;border:1px solid #2c3a4a;border-radius:16px;font-family:Rubik,Segoe UI,Arial,sans-serif;">
            <p style="margin:0;font-size:13px;line-height:1;font-weight:800;letter-spacing:.16em;color:#9d94ff;">KDEENOFF</p>
            <h1 style="margin:18px 0 8px;font-size:32px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:#e7eef6;">Your code</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#93a4b8;">Enter it on your account page. It expires in 10 minutes.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" align="center">
              <tr>
                <td align="center" bgcolor="#0c1218" style="background:#0c1218;border-radius:10px;padding:14px 14px 14px 22px;font-family:Rubik,Segoe UI,Arial,sans-serif;font-size:26px;line-height:1;font-weight:800;letter-spacing:.32em;color:#e7eef6;-webkit-user-select:all;user-select:all;">${value}</td>
              </tr>
            </table>
            <p style="margin:28px 0 0;font-size:14px;line-height:1.5;"><a href="${SITE}" style="color:#9d94ff;text-decoration:none;">Open your account</a></p>
            <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#7d8798;">If you did not ask for this code, you can ignore this email.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
