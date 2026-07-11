import { createClient } from '@supabase/supabase-js';

const url = process.env.RESTOGOGO_BOOTSTRAP_SUPABASE_URL;
const key = process.env.RESTOGOGO_BOOTSTRAP_API_KEY;

if (!url || !key) {
  throw new Error('Hosted Realtime bootstrap credentials are missing.');
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

for (let attempt = 1; attempt <= 12; attempt += 1) {
  const channel = supabase.channel(`restogogo:bootstrap:${attempt}`);
  try {
    const status = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('TIMED_OUT'), 10_000);
      channel.subscribe((nextStatus) => {
        if (nextStatus === 'SUBSCRIBED' || nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
          clearTimeout(timeout);
          resolve(nextStatus);
        }
      });
    });
    if (status === 'SUBSCRIBED') {
      console.log(`Hosted Realtime initialized after ${attempt} attempt(s).`);
      await supabase.removeChannel(channel);
      supabase.realtime.disconnect();
      process.exit(0);
    }
  } finally {
    await supabase.removeChannel(channel);
  }
  await wait(10_000);
}

supabase.realtime.disconnect();
throw new Error('Hosted Realtime did not become available within two minutes.');
