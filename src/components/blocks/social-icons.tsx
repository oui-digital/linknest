import type { IconType } from "react-icons";
import {
  FaBluesky,
  FaDiscord,
  FaEnvelope,
  FaFacebookF,
  FaGithub,
  FaInstagram,
  FaLinkedinIn,
  FaMedium,
  FaPatreon,
  FaPhone,
  FaPinterestP,
  FaRedditAlien,
  FaSnapchat,
  FaSoundcloud,
  FaSpotify,
  FaTelegram,
  FaThreads,
  FaTiktok,
  FaTwitch,
  FaWhatsapp,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import type { SocialPlatformId } from "@/lib/social-platforms";

/**
 * Brand marks from Font Awesome 6 via react-icons. They render as plain inline
 * <svg> on the server, so public pages ship no icon JavaScript.
 */
export const SOCIAL_ICONS: Record<SocialPlatformId, IconType> = {
  instagram: FaInstagram,
  x: FaXTwitter,
  tiktok: FaTiktok,
  youtube: FaYoutube,
  linkedin: FaLinkedinIn,
  threads: FaThreads,
  bluesky: FaBluesky,
  facebook: FaFacebookF,
  pinterest: FaPinterestP,
  snapchat: FaSnapchat,
  twitch: FaTwitch,
  discord: FaDiscord,
  telegram: FaTelegram,
  whatsapp: FaWhatsapp,
  github: FaGithub,
  reddit: FaRedditAlien,
  soundcloud: FaSoundcloud,
  spotify: FaSpotify,
  medium: FaMedium,
  patreon: FaPatreon,
  email: FaEnvelope,
  phone: FaPhone,
};
