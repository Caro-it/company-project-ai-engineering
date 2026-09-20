import { getRecords } from '@/services/records';

export default async function Home() {
  const response = await getRecords();
  return <pre>{JSON.stringify(response.total, null, 2)}</pre>;
}