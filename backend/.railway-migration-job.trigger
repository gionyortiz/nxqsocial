# Intentional Railway migration-job deployment trigger.
#
# This marker is the migration service's only Git watch path. Changing it is a
# reviewed release action; ordinary backend commits must not redeploy the
# privileged one-shot migration service.
trigger-version=1
