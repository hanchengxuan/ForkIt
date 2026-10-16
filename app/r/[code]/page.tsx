import { Suspense } from "react";
import Room from "./Room";

export default function RoomPage({ params }: PageProps<"/r/[code]">) {
  return (
    <Suspense>
      <RoomWithCode params={params} />
    </Suspense>
  );
}

async function RoomWithCode({ params }: Pick<PageProps<"/r/[code]">, "params">) {
  const { code } = await params;
  return <Room key={code} code={code.toUpperCase()} />; // key: a fresh room screen when jumping between groups
}
