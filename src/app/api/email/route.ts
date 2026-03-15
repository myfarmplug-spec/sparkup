import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

type EmailEvent =
  | "welcome"
  | "signin"
  | "spark_posted"
  | "reaction_received"
  | "profile_updated"
  | "password_reset"
  | "new_messages";

interface EmailPayload {
  event: EmailEvent;
  to: string;
  name: string;
  username: string;
  extra?: Record<string, string | number>;
}

const ORANGE = "#E05A1C";
const BROWN  = "#5C2D0E";

function base(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>icreate.africa</title></head>
<body style="margin:0;padding:0;background:#FDF4EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF4EE;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${BROWN} 0%,#8B3A0F 60%,${ORANGE} 100%);border-radius:20px 20px 0 0;padding:32px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:6px;">🔥</div>
            <div style="color:white;font-size:22px;font-weight:900;letter-spacing:-0.5px;">icreate.africa</div>
            <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px;">Show your spark</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:white;padding:36px 40px;border-radius:0 0 20px 20px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            ${content}
            <hr style="border:none;border-top:1px solid #FDE8D8;margin:28px 0;">
            <p style="color:#aaa;font-size:12px;text-align:center;margin:0;">
              You're receiving this because you joined <strong>icreate.africa</strong><br>
              <a href="https://www.icreate.africa" style="color:${ORANGE};text-decoration:none;">Visit the platform</a><br><br>
              <span style="color:#ccc;font-size:11px;">Powered by DotXan Tech</span>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url = "https://sparkup-rust.vercel.app") {
  return `<a href="${url}" style="display:inline-block;background:${ORANGE};color:white;font-weight:900;font-size:15px;padding:14px 32px;border-radius:14px;text-decoration:none;margin:20px 0;">${text}</a>`;
}

function templates(payload: EmailPayload): { subject: string; html: string } {
  const { name, username, extra = {} } = payload;

  switch (payload.event) {
    case "welcome":
      return {
        subject: `🔥 Welcome to icreate.africa, ${name}!`,
        html: base(`
          <h1 style="color:${BROWN};font-size:26px;font-weight:900;margin:0 0 8px;">Welcome to the family, ${name}! 🌍</h1>
          <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
            Africa just got one spark brighter. Your account <strong style="color:${ORANGE};">@${username}</strong> is live and ready to spark.
          </p>
          <div style="background:#FDF4EE;border-radius:14px;padding:20px 24px;margin:20px 0;border-left:4px solid ${ORANGE};">
            <p style="margin:0;color:${BROWN};font-weight:700;font-size:14px;">Here's what you can do right now:</p>
            <ul style="color:#555;font-size:14px;line-height:2;margin:10px 0 0;padding-left:20px;">
              <li>🎥 Share your first spark — a video, photo, anything you create</li>
              <li>🌍 Connect with creators across 54 African countries</li>
              <li>✨ You have <strong>${extra.coins ?? 1000} tokens</strong> ready to use</li>
              <li>🔥 React, encourage, and build your creator journey</li>
            </ul>
          </div>
          <p style="text-align:center;">${btn("🔥 Go to my Spark Feed")}</p>
          <p style="color:#888;font-size:13px;text-align:center;font-style:italic;">Show your spark. Africa is watching. 🌍</p>
        `),
      };

    case "signin":
      return {
        subject: `👋 Welcome back, ${name}!`,
        html: base(`
          <h1 style="color:${BROWN};font-size:26px;font-weight:900;margin:0 0 8px;">Good to see you back, ${name}! 👋</h1>
          <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
            You just signed into <strong style="color:${ORANGE};">@${username}</strong> on icreate.africa.
            The community has been waiting for your spark. 🔥
          </p>
          <div style="background:#FDF4EE;border-radius:14px;padding:18px 24px;margin:20px 0;border-left:4px solid ${ORANGE};">
            <p style="margin:0;color:#555;font-size:14px;line-height:1.8;">
              📅 <strong>Signed in:</strong> ${new Date().toLocaleString("en-GB", { dateStyle:"full", timeStyle:"short" })}<br>
              🌍 <strong>Platform:</strong> icreate.africa
            </p>
          </div>
          <p style="color:#888;font-size:13px;">If this wasn't you, please contact us immediately.</p>
          <p style="text-align:center;">${btn("✨ Go to my Feed")}</p>
        `),
      };

    case "spark_posted":
      return {
        subject: `✨ Your spark is live, ${name}!`,
        html: base(`
          <h1 style="color:${BROWN};font-size:26px;font-weight:900;margin:0 0 8px;">Your spark is LIVE! 🚀</h1>
          <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
            <strong style="color:${ORANGE};">@${username}</strong>, your new spark is now out in the world for all of Africa to see.
            Let the reactions roll in! 🌍
          </p>
          <div style="background:#FDF4EE;border-radius:14px;padding:18px 24px;margin:20px 0;border-left:4px solid ${ORANGE};">
            <p style="margin:0;color:#555;font-size:14px;line-height:1.8;">
              🎬 <strong>Spark type:</strong> ${extra.sparkType === "ongoing" ? "Ongoing Spark 🔗" : "New Spark ✨"}<br>
              📡 <strong>Reach:</strong> ${extra.reach === "beyond" ? "Great Beyond 🌟" : "Community Share 🌍"}
              ${extra.caption ? `<br>💬 <strong>Caption:</strong> "${extra.caption}"` : ""}
            </p>
          </div>
          <p style="color:#555;font-size:14px;line-height:1.7;">Share it with your people and let them see what you've got. Every great creator started with one spark. ⚡</p>
          <p style="text-align:center;">${btn("🔥 See my Spark")}</p>
        `),
      };

    case "reaction_received":
      return {
        subject: `💪 Someone reacted to your spark!`,
        html: base(`
          <h1 style="color:${BROWN};font-size:26px;font-weight:900;margin:0 0 8px;">Your spark is getting love! ${extra.emoji ?? "🔥"}</h1>
          <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
            <strong style="color:${ORANGE};">@${extra.reactorUsername ?? "Someone"}</strong> just reacted
            <strong>"${extra.reaction}"</strong> to your spark on create.africa!
          </p>
          <div style="background:#FDF4EE;border-radius:14px;padding:18px 24px;margin:20px 0;border-left:4px solid ${ORANGE};">
            <p style="margin:0 0 8px;color:${BROWN};font-weight:700;">Keep creating, ${name}. Africa is watching. 👀</p>
            <p style="margin:0;color:#555;font-size:14px;line-height:1.8;">
              Every reaction is proof that your voice matters. Don't stop — the community needs your spark. 🌍✨
            </p>
          </div>
          <p style="text-align:center;">${btn("🔥 See my Sparks")}</p>
        `),
      };

    case "profile_updated":
      return {
        subject: `✅ Profile updated successfully`,
        html: base(`
          <h1 style="color:${BROWN};font-size:26px;font-weight:900;margin:0 0 8px;">Profile updated! ✅</h1>
          <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
            Hey <strong style="color:${ORANGE};">@${username}</strong>, your create.africa profile has been updated successfully.
          </p>
          <div style="background:#FDF4EE;border-radius:14px;padding:18px 24px;margin:20px 0;border-left:4px solid ${ORANGE};">
            <p style="margin:0;color:#555;font-size:14px;line-height:1.8;">
              👤 <strong>Name:</strong> ${name}<br>
              🏷️ <strong>Username:</strong> @${username}
              ${extra.occupation ? `<br>💼 <strong>Occupation:</strong> ${extra.occupation}` : ""}
              ${extra.country ? `<br>🌍 <strong>Location:</strong> ${[extra.city, extra.state, extra.country].filter(Boolean).join(", ")}` : ""}
            </p>
          </div>
          <p style="text-align:center;">${btn("View my Spark Passport")}</p>
        `),
      };

    case "new_messages":
      return {
        subject: `💬 ${extra.senderName} is messaging you on icreate.africa!`,
        html: base(`
          <h1 style="color:${BROWN};font-size:26px;font-weight:900;margin:0 0 8px;">You've got messages! 💬</h1>
          <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
            <strong style="color:${ORANGE};">@${extra.senderUsername}</strong> has sent you ${extra.count} messages on icreate.africa.
            Don't leave them waiting — come reply! 🤍
          </p>
          <div style="background:#FDF4EE;border-radius:14px;padding:20px 24px;margin:20px 0;border-left:4px solid ${ORANGE};">
            <p style="margin:0;color:${BROWN};font-weight:700;font-size:14px;">💬 ${extra.count} message${Number(extra.count)===1?"":"s"} waiting for you</p>
            <p style="margin:8px 0 0;color:#555;font-size:13px;line-height:1.8;">From: <strong>${extra.senderName}</strong> (@${extra.senderUsername})</p>
          </div>
          <p style="color:#888;font-size:13px;text-align:center;">The conversation is live — jump back in and keep the spark going. 🔥</p>
          <p style="text-align:center;">${btn("💬 Open Messages")}</p>
        `),
      };

    case "password_reset":
      return {
        subject: `🔑 Your icreate.africa password`,
        html: base(`
          <h1 style="color:${BROWN};font-size:26px;font-weight:900;margin:0 0 8px;">Password Recovery 🔑</h1>
          <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
            Hey <strong style="color:${ORANGE};">@${username}</strong>, here is your account password as requested.
          </p>
          <div style="background:#FDF4EE;border-radius:14px;padding:20px 24px;margin:20px 0;border-left:4px solid ${ORANGE};text-align:center;">
            <p style="margin:0 0 8px;color:${BROWN};font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Your password</p>
            <p style="margin:0;color:${BROWN};font-size:24px;font-weight:900;letter-spacing:4px;">${extra.password}</p>
          </div>
          <p style="color:#888;font-size:13px;">For your security, consider changing your password after signing in.</p>
          <p style="text-align:center;">${btn("🔥 Sign In Now")}</p>
        `),
      };
  }
}

export async function POST(request: Request) {
  try {
    const payload: EmailPayload = await request.json();

    // If no resend client, return success without sending (graceful degradation)
    if (!resend) {
      console.log("Email would be sent:", payload.event, "to", payload.to);
      return NextResponse.json({ id: "no-resend-configured", success: true });
    }

    const { subject, html } = templates(payload);

    const { data, error } = await resend.emails.send({
      from: "icreate.africa <onboarding@resend.dev>",
      to: [payload.to],
      subject,
      html,
    });

    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ id: data?.id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
