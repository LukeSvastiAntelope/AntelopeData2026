import { NextRequest, NextResponse } from "next/server";
import { UserRepo } from "@/app/utils/database/user-repo";
import { RowDataPacket } from 'mysql2/promise';

export async function GET(req: NextRequest) {
  try {
    const users = await UserRepo.getAllUsersBasic();
    return NextResponse.json({ status: true, users });
  } catch (error) {
    console.error("Error fetching users for admin:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ status: false, message: "Failed to fetch users", error: errorMessage }, { status: 500 });
  }
}