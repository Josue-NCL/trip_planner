update public.idea_votes
set vote = case vote
  when 'love' then 'like'
  when 'maybe' then 'ok'
  else vote
end
where vote in ('love', 'maybe');

alter table public.idea_votes
  drop constraint if exists idea_votes_vote_check;

alter table public.idea_votes
  add constraint idea_votes_vote_check
  check (vote in ('like', 'ok', 'interesting', 'pass'));
