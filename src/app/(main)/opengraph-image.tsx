import { marketingSocialImage, SOCIAL_IMAGE_SIZE } from "@/lib/marketing/social-image";

export const runtime = "nodejs";
export const size = SOCIAL_IMAGE_SIZE;
export const contentType = "image/png";
export const alt = "LinkNest: a better home for your links";
export default function Image() { return marketingSocialImage("A better home for your links", "Content · bookings · audience"); }
