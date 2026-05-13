import { requireUser } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() || "";

    if (query.length < 2) {
      return Response.json([]);
    }

    await connectDB();

    const regex = new RegExp(query, "i");
    const players = await User.find({
      $or: [{ username: regex }, { whatsapp: regex }],
    })
      .select("_id username avatar")
      .limit(10)
      .lean();

    return Response.json(players);
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}
