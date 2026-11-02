import { guardPage } from '@/lib/auth';
import Dash from './dash';

export default async function Page() {
  const s = await guardPage('NGO');
  return <Dash name={s.name} />;
}
