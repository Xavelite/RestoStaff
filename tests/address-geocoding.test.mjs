import assert from 'node:assert/strict';
import test from 'node:test';

import {
  googleMapsSearchUrl,
  osmEmbedUrl,
  osmLocationUrl,
  restaurantAddressQuery,
  searchBelgianRestaurantAddress
} from '../src/lib/restaurant/address-geocoding.ts';

test('restaurant address lookup is explicit, Belgian and maps provider fields safely', async () => {
  const query = restaurantAddressQuery({
    restaurantName: 'Demo',
    street: 'Rue Haute 1',
    postalCode: '1000',
    city: 'Brussels'
  });
  let requested = null;
  const results = await searchBelgianRestaurantAddress(query, async (url) => {
    requested = new URL(url);
    return new Response(JSON.stringify([
      {
        display_name: 'Demo, Rue Haute 1, 1000 Brussels, Belgium',
        lat: '50.8401',
        lon: '4.3517',
        address: {
          road: 'Rue Haute',
          house_number: '1',
          postcode: '1000',
          city: 'Brussels'
        }
      },
      { display_name: 'Malformed', lat: 'nope', lon: '4.3' }
    ]), { status: 200 });
  });

  assert.equal(query, 'Rue Haute 1, 1000 Brussels, Belgium');
  assert.equal(requested.searchParams.get('countrycodes'), 'be');
  assert.equal(requested.searchParams.get('addressdetails'), '1');
  assert.deepEqual(results, [{
    displayName: 'Demo, Rue Haute 1, 1000 Brussels, Belgium',
    latitude: 50.8401,
    longitude: 4.3517,
    street: 'Rue Haute 1',
    postalCode: '1000',
    city: 'Brussels'
  }]);
});

test('Google listing links use the free cross-platform Maps URL contract', () => {
  const url = new URL(googleMapsSearchUrl({
    restaurantName: 'Demo',
    street: 'Rue Haute 1',
    postalCode: '1000',
    city: 'Brussels'
  }));

  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/search/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('query'), 'Rue Haute 1, 1000 Brussels, Belgium');
});

test('OpenStreetMap links retain the resolved marker without hand-built markup', () => {
  const embed = new URL(osmEmbedUrl(50.8401, 4.3517));
  const external = new URL(osmLocationUrl(50.8401, 4.3517));

  assert.equal(embed.origin, 'https://www.openstreetmap.org');
  assert.equal(embed.searchParams.get('marker'), '50.8401,4.3517');
  assert.equal(external.searchParams.get('mlat'), '50.8401');
  assert.equal(external.hash, '#map=18/50.8401/4.3517');
});
