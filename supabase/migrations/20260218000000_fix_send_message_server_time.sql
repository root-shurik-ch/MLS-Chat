-- Fix ambiguous "server_time" in send_message RETURNING (qualify with table name)
create or replace function send_message(
  p_group_id text,
  p_sender_id text,
  p_device_id text,
  p_msg_kind text,
  p_mls_bytes text
) returns table(server_seq bigint, server_time bigint) as $$
declare
  v_server_seq bigint;
  v_server_time bigint;
begin
  select last_server_seq into v_server_seq from group_seq where group_id = p_group_id for update;
  if not found then
    v_server_seq := 0;
    insert into group_seq (group_id, last_server_seq) values (p_group_id, 1);
    v_server_seq := 1;
  else
    v_server_seq := v_server_seq + 1;
    update group_seq set last_server_seq = v_server_seq where group_id = p_group_id;
  end if;

  insert into messages (group_id, server_seq, sender_id, device_id, msg_kind, mls_bytes)
  values (p_group_id, v_server_seq, p_sender_id, p_device_id, p_msg_kind, p_mls_bytes)
  returning (extract(epoch from messages.server_time) * 1000)::bigint into v_server_time;

  return query select v_server_seq, v_server_time;
end;
$$ language plpgsql;
