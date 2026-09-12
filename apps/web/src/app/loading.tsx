import { Loading } from "@/components/Loading";

/** Every page while its first render is on its way: one wheel, centred, never a guessed shape. */
export default function PageLoading() {
  return <Loading page />;
}
