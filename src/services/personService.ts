import { Person } from "../models/person";
import { setTimeout } from "node:timers/promises";
import { performance } from "node:perf_hooks";

const persons: Person[] = [
  { id: 1, title: "Task A" },
  { id: 2, title: "Task B" },
  { id: 3, title: "Task C" },
  { id: 4, title: "Task D" },
  { id: 5, title: "Task E" },
  { id: 6, title: "Task F" },
];

async function fetchPerson(userId: number): Promise<Person | undefined> {
  await setTimeout(2000);

  const foundPeston = persons.find((p) => {
    return p.id === userId;
  });

  return foundPeston;
}

export const getPersonsNoConcurrenyLimit = async (userIds: number[]): Promise<Person[]> => {
  const limit = 3;

  const personPromises = userIds.map((uid) => fetchPerson(uid));

  const fetchedPersons = await Promise.all(personPromises);
  
  return fetchedPersons.filter((person): person is Person => person !== undefined);
};

//most efficient approach with concurrency limit
export const getPersons1 = async (userIds: number[]): Promise<Person[]> => {
  const start = performance.now();
  const limit = 3;
  const fetchedPersons: (Person | undefined)[] = [];
  let index = 0;

  async function worker() {
    while (index < userIds.length) {
      const current = index++;
      console.log('current', current);
      fetchedPersons[current] = await fetchPerson(userIds[current]);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));

  const end = performance.now();
  console.log(`Execution time: ${(end - start).toFixed(3)} ms`);

  return fetchedPersons.filter((person): person is Person => person !== undefined);
};

//less efficient approach with concurrency limit - more intuitive for me
export const getPersons = async (userIds: number[]): Promise<Person[]> => {
  const start = performance.now();
  const results: Person[] = [];
  const limit = 3;
  for (let i = 0; i < userIds.length; i += limit) {
    const chunkArray = userIds.slice(i, i + limit);
    console.log('chunkArray', chunkArray);
    const fecthPersonPromiseArray = chunkArray.map( id => fetchPerson(id))
    const fetchedPersons = await Promise.all(fecthPersonPromiseArray);
    results.push(...fetchedPersons.filter((person): person is Person => person !== undefined));
  }
  const end = performance.now();
  console.log(`Execution time: ${(end - start).toFixed(3)} ms`);
  return results;
}

