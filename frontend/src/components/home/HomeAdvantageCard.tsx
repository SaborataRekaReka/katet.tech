import { IllustrationIcon } from "@/components/ui/IllustrationIcon";

export type HomeAdvantageTone = "red" | "blue" | "green" | "gold";

const TONE_CLASS_BY_VALUE: Record<HomeAdvantageTone, string> = {
  red: "home-advantage__icon--red",
  blue: "home-advantage__icon--blue",
  green: "home-advantage__icon--green",
  gold: "home-advantage__icon--gold",
};

export function HomeAdvantageCard({
  icon,
  title,
  text,
  tone,
}: {
  icon: string;
  title: string;
  text: string;
  tone: HomeAdvantageTone;
}) {
  return (
    <article className="home-advantage">
      <span className={`home-advantage__icon ${TONE_CLASS_BY_VALUE[tone]}`}>
        <IllustrationIcon src={icon} size="sm" />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}
